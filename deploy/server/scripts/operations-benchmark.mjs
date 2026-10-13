import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// Runs real desktop service code against local HTTP supplier doubles. No production credentials.
const repository = fileURLToPath(new URL('../../../', import.meta.url))
const frontend = resolve(repository, 'frontend')
const require = createRequire(resolve(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const loader = await createServer({ root: frontend, configFile: false, appType: 'custom', server: { middlewareMode: true } })
const [{ OperationsTelemetry }, { LlmClient }, { RemoteKnowledgeClient }, { WebSearchClient }, { retrieveAnswerContext }, { defaultSettings }] = await Promise.all([
  '/src/main/services/operations-telemetry.ts', '/src/main/services/llm-client.ts',
  '/src/main/services/remote-knowledge-client.ts', '/src/main/services/web-search-client.ts',
  '/src/main/services/answer-retrieval.ts', '/src/shared/defaults.ts',
].map(path => loader.ssrLoadModule(path)))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)]
const samples = Number(process.env.OPERATIONS_BENCH_SAMPLES ?? 512)
const concurrency = Number(process.env.OPERATIONS_BENCH_CONCURRENCY ?? 8)
assert(samples >= 100 && samples <= 10000 && concurrency >= 1 && concurrency <= 32)
let capture = false
let unavailable = false
let reported = 0
const reportedStages = new Map()
let providerRequests = 0
const server = http.createServer(async (request, response) => {
  try {
    let body = ''
    for await (const chunk of request) body += chunk
    if (request.url === '/api/v1/telemetry/settings') return response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ enabled: capture }))
    if (request.url === '/api/v1/telemetry/operations') {
      if (unavailable) return response.writeHead(503).end()
      const batch = JSON.parse(body)
      assert(batch.events.length <= 64 && Buffer.byteLength(body) <= 262144)
      assert(!body.includes('BENCH_QUESTION_PRIVATE') && !body.includes('BENCH_ANSWER_PRIVATE'))
      reported += batch.events.length
      for (const event of batch.events) {
        reportedStages.set(event.stage, (reportedStages.get(event.stage) ?? 0) + 1)
        if (event.stage === 'llm.complete' && event.outcome === 'success') {
          assert.equal(event.metadata?.inputTokens, 40)
          assert.equal(event.metadata?.outputTokens, 16)
          assert.equal(event.metadata?.totalTokens, 56)
        }
      }
      return response.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify({ accepted: batch.events.length, dropped: 0 }))
    }
    if (request.url === '/rag') {
      await delay(5)
      return response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true, data: { nodes: [{ text: '本地模拟知识资料' }] } }))
    }
    if (request.url === '/api/v1/web-search') {
      await delay(8)
      return response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ready', excerpts: [{ source: 'web', kind: 'technical', documentId: 'web:bench', chunkId: 'bench', revision: 1, name: '本地模拟网页', url: 'https://example.test/bench', text: '本地模拟网页资料' }] }))
    }
    if (request.url === '/v1/chat/completions') {
      providerRequests++
      assert.equal(request.headers['x-operation-id'], undefined, 'Do not forward observation headers to custom suppliers')
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
      response.write(': heartbeat\n\n')
      response.write('data: {"choices":[{"delta":{"content":""}}]}\n\n')
      for (let i = 0; i < 8; i++) {
        await delay(2)
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: i ? '本地模拟流式正文' : 'BENCH_ANSWER_PRIVATE' } }] })}\n\n`)
      }
      response.write('data: {"choices":[],"usage":{"prompt_tokens":40,"completion_tokens":16,"total_tokens":56}}\n\n')
      return response.end('data: [DONE]\n\n')
    }
    response.writeHead(404).end()
  } catch (error) { response.writeHead(500).end(); process.stderr.write(`Mock assertion failed: ${error.message}\n`) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
const config = { ...structuredClone(defaultSettings), llm: { ...defaultSettings.llm, baseUrl: `${url}/v1`, model: 'benchmark-local' },
  remoteKnowledge: { enabled: true, url: `${url}/rag`, agentId: 'benchmark', hasApiKey: true }, webSearch: { enabled: true },
  platform: { ...defaultSettings.platform, enabled: true, authenticated: true, baseUrl: url, advancedSettingsEnabled: true, webSearchAvailable: true } }

async function run(capturing, count, broken = false, workers = concurrency, thinkMs = 0) {
  capture = capturing; unavailable = broken
  const telemetry = new OperationsTelemetry(async () => ({ accountId: 'benchmark', baseUrl: url, token: 'local-test-token' }), 'benchmark')
  await telemetry.refresh()
  telemetry.start()
  const durations = []
  const first = []
  let next = 0
  const cpu = process.cpuUsage()
  const start = performance.now()
  try {
    await Promise.all(Array.from({ length: workers }, async () => {
      while (next++ < count) {
        const started = performance.now()
        const requestId = randomUUID()
        const operation = telemetry.operation({ operationId: randomUUID(), requestId, model: 'benchmark-local', serviceSource: 'custom' })
        const retrieval = await telemetry.measure(operation, 'retrieval.join', () => retrieveAnswerContext(
          signal => telemetry.measure(operation, 'retrieval.rag', () => new RemoteKnowledgeClient(config.remoteKnowledge, 'local-key').retrieve('BENCH_QUESTION_PRIVATE', signal), 'bailian'),
          signal => telemetry.measure(operation, 'retrieval.web', () => new WebSearchClient(config, 'local-test-token').retrieve('BENCH_QUESTION_PRIVATE', signal), 'tavily'),
          new AbortController().signal))
        let displayed = false
        const observation = operation && { ...operation, spanId: randomUUID(), parentSpanId: operation.spanId, providerType: 'llm' }
        await new LlmClient(config, 'local-key', event => {
          if (event.kind === 'answer-error') throw new Error(event.message)
          if (event.kind === 'answer-delta' && event.delta.trim() && !displayed) { displayed = true; first.push(performance.now() - started) }
        }, false, telemetry, observation).generate({ requestId, question: 'BENCH_QUESTION_PRIVATE', transcript: '' }, retrieval)
        assert(displayed)
        durations.push(performance.now() - started)
        if (thinkMs) await delay(thinkMs)
      }
    }))
    const elapsedMs = performance.now() - start
    const cpuUsed = process.cpuUsage(cpu)
    const diagnostics = telemetry.diagnostics()
    assert(diagnostics.queueSize <= 200 && diagnostics.queueBytes <= 2097152)
    // Drain the bounded queue; each request still obeys the normal 64-event limit.
    for (let i = 0; i < 4 && telemetry.diagnostics().queueSize; i++) await telemetry.flush()
    return { capture: capturing, unavailable: broken, count, p50Ms: quantile(durations, .5), p95Ms: quantile(durations, .95), firstContentP95Ms: quantile(first, .95), elapsedMs,
      throughput: count * 1000 / elapsedMs, cpuMs: (cpuUsed.user + cpuUsed.system) / 1000, heapUsedBytes: process.memoryUsage().heapUsed, queue: diagnostics }
  } finally { telemetry.dispose() }
}

try {
  await run(false, 64)
  await run(true, 64)
  const rounds = []
  for (let i = 0; i < 3; i++) {
    const pair = i % 2 ? [await run(true, samples), await run(false, samples)] : [await run(false, samples), await run(true, samples)]
    rounds.push({ off: pair.find(item => !item.capture), on: pair.find(item => item.capture) })
  }
  const offMs = rounds.reduce((sum, round) => sum + round.off.elapsedMs, 0)
  const onMs = rounds.reduce((sum, round) => sum + round.on.elapsedMs, 0)
  const p95IncreaseMs = quantile(rounds.map(round => round.on.p95Ms - round.off.p95Ms), .5)
  const throughputDecrease = Math.max(0, 1 - offMs / onMs)
  const fault = await run(true, samples, true)
  const beforeSteady = reported
  const steady = await run(true, 24, false, 1, 1000)
  assert.equal(steady.queue.dropped, 0, 'Normal paced reporting should retain all events')
  steady.reported = reported - beforeSteady
  assert.equal(steady.reported, 24 * 6)
  const report = { scope: 'Real desktop RAG + web HTTP parallel retrieval and custom LLM streaming services; excludes Java/IPC/render timings. Burst comparison exercises intentional queue dropping; paced run verifies the normal ten-second flush.',
    samplesPerMode: samples * 3, concurrency, rounds, p95IncreaseMs, throughputDecrease, accepted: p95IncreaseMs <= 5 && throughputDecrease <= .02,
    fault, steady, reported, reportedStages: Object.fromEntries(reportedStages), providerRequests, supplier: 'local deterministic HTTP double', productionCalled: false }
  await mkdir(resolve(frontend, 'test-results'), { recursive: true })
  await writeFile(resolve(frontend, 'test-results/operations-benchmark.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  if (!report.accepted) process.exitCode = 1
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await loader.close()
}
