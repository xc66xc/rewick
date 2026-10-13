import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

// Credentials come only from the owner-only, isolated smoke fixture. Never log it.
const fixturePath = process.env.OPERATIONS_SMOKE_READY_FILE
assert(fixturePath, 'Start frontend/scripts/smoke-operations.mjs with a private ready file first')
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
assert(new URL(fixture.baseUrl).hostname === '127.0.0.1', 'Never benchmark production')
const execute = promisify(execFile)
const count = Number(process.env.OPERATIONS_BENCH_SAMPLES ?? 256)
assert(count >= 200 && count <= 2000)
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
async function admin(path, body) {
  const response = await fetch(`${fixture.baseUrl}/api/v1/admin/operations/${path}`, {
    method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${fixture.adminToken}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
  })
  assert.equal(response.status, 200, `Operations ${path} returned HTTP ${response.status}`)
  return response.json()
}
async function processUsage() {
  const result = (await execute('ps', ['-p', String(fixture.backendPid), '-o', 'time=', '-o', 'rss='])).stdout.trim().split(/\s+/)
  const parts = result[0].split(':').map(Number)
  return { cpuSeconds: parts.reduce((value, part) => value * 60 + part, 0), rssBytes: Number(result[1]) * 1024 }
}
async function run(enabled, requests) {
  process.stdout.write(`Measuring capture=${enabled} requests=${requests}\n`)
  const settings = await admin('settings')
  await admin('settings', { ...settings, enabled })
  let next = 0
  const complete = [], first = []
  const before = await processUsage(), started = performance.now()
  await Promise.all(fixture.benchmarkUsers.map(async user => {
    while (next++ < requests) {
      const start = performance.now()
      const response = await fetch(`${fixture.baseUrl}/api/v1/llm/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json',
          'X-Request-Id': randomUUID(), 'X-Operation-Id': randomUUID(), 'X-Parent-Span-Id': randomUUID() },
        body: JSON.stringify({ model: fixture.model, stream: true, messages: [{ role: 'user', content: 'synthetic-local-benchmark' }] }),
        signal: AbortSignal.timeout(15000),
      })
      if (response.status !== 200) throw new Error(`Local fixture LLM HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`)
      let pending = '', received = false, done = false
      for await (const chunk of response.body) {
        pending += Buffer.from(chunk).toString('utf8')
        let boundary
        while ((boundary = pending.indexOf('\n\n')) >= 0) {
          const event = pending.slice(0, boundary); pending = pending.slice(boundary + 2)
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') { done = true; continue }
            const content = JSON.parse(data).choices?.[0]?.delta?.content
            if (!received && typeof content === 'string' && content.trim()) { first.push(performance.now() - start); received = true }
          }
        }
      }
      assert(received && done, 'Mock stream must finish with actual body')
      complete.push(performance.now() - start)
    }
  }))
  const elapsedMs = performance.now() - started, after = await processUsage()
  return { enabled, requests, elapsedMs, throughput: requests * 1000 / elapsedMs,
    p50Ms: quantile(complete, .5), p95Ms: quantile(complete, .95), firstContentP95Ms: quantile(first, .95),
    cpuSeconds: after.cpuSeconds - before.cpuSeconds, rssBytes: after.rssBytes }
}
let report
try {
  await run(false, 64); await run(true, 64)
  const rounds = []
  for (let round = 0; round < 3; round++) {
    const results = round % 2 ? [await run(true, count), await run(false, count)] : [await run(false, count), await run(true, count)]
    rounds.push({ off: results.find(value => !value.enabled), on: results.find(value => value.enabled) })
  }
  const p95IncreaseMs = quantile(rounds.map(value => value.on.p95Ms - value.off.p95Ms), .5)
  const onMs = rounds.reduce((sum, value) => sum + value.on.elapsedMs, 0)
  const offMs = rounds.reduce((sum, value) => sum + value.off.elapsedMs, 0)
  const throughputDecrease = Math.max(0, 1 - offMs / onMs)
  const storage = JSON.parse((await execute('docker', ['stats', '--no-stream', '--format', '{{json .}}', fixture.containers.operations])).stdout.trim())
  report = { scope: 'Actual local Java HTTP -> business authentication/lease -> mock LLM SSE, with independent operations PostgreSQL; excludes Electron rendering and retrieval, verified separately.',
    samplesPerMode: count * 3, concurrency: fixture.benchmarkUsers.length, rounds, p95IncreaseMs, throughputDecrease,
    accepted: p95IncreaseMs <= 5 && throughputDecrease <= .02, monitorContainer: { memory: storage.MemUsage, cpu: storage.CPUPerc },
    health: await admin('health'), productionCalled: false }
  await mkdir(resolve('frontend/test-results'), { recursive: true })
  await writeFile(resolve('frontend/test-results/operations-backend-benchmark.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  if (!report.accepted) process.exitCode = 1
} finally {
  const settings = await admin('settings').catch(() => undefined)
  if (settings) await admin('settings', { ...settings, enabled: true })
  // Keep a failed fixture alive for diagnosis; the smoke harness has its own timeout.
  if (report) await writeFile(`${fixturePath}.done`, 'benchmark complete', { mode: 0o600 })
}
