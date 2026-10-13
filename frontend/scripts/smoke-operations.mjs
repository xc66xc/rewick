import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readdir, writeFile, rm, access, copyFile, readFile, symlink, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import net from 'node:net'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import { checkEnvironmentStamps } from '../tests/e2e/environment-stamp.mjs'
import { startMockServices } from './mock-services.mjs'

const execute = promisify(execFile)
const frontend = dirname(dirname(fileURLToPath(import.meta.url)))
const repository = dirname(frontend)
const output = join(frontend, 'test-results')
const temporary = await mkdtemp(join(tmpdir(), 'copilot-operations-e2e-'))
const suffix = randomBytes(6).toString('hex')
const password = randomBytes(24).toString('hex')
const databaseImage = 'interview-copilot-postgres:15.19-pgvector0.8.6'
const containers = { business: `copilot-ops-business-${suffix}`, operations: `copilot-ops-storage-${suffix}` }
const started = []
const checks = []
const supplierRequests = []
const marker = 'synthetic-private-answer-for-operations-smoke'
const mock = await startMockServices()
let backend, application, page, heartbeatTimer
let logs = ''
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, message, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await predicate()) return; await pause(200) }
  throw new Error(message)
}
async function port() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const result = server.address().port; await new Promise(resolve => server.close(resolve)); return result
}
const supplier = http.createServer(async (request, response) => {
  if (request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return }
  let input = ''; for await (const chunk of request) input += chunk
  const body = JSON.parse(input)
  const item = { model: body.model, headers: request.headers, cancelled: false, completed: false, started: performance.now() }
  supplierRequests.push(item)
  response.on('close', () => { if (!item.completed) item.cancelled = true })
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  response.write(': heartbeat only\n\ndata: {"choices":[{"delta":{}}]}\n\n')
  await pause(120)
  if (response.destroyed) return
  response.write('data: {"choices":[{"delta":{"content":" "}}]}\n\n')
  await pause(30)
  if (response.destroyed) return
  item.firstSent = performance.now()
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: marker } }] })}\n\n`)
  if (body.model === 'mock-held') return
  await pause(70)
  if (response.destroyed) return
  response.write('data: {"choices":[],"usage":{"prompt_tokens":21,"completion_tokens":9,"total_tokens":30}}\n\n')
  item.completed = true; item.completedAt = performance.now()
  response.end('data: [DONE]\n\n')
})
await new Promise(resolve => supplier.listen(0, '127.0.0.1', resolve))
const llmUrl = `http://127.0.0.1:${supplier.address().port}/v1`
async function sql(container, statement) {
  return (await execute('docker', ['exec', container, 'psql', '-X', '-U', 'copilot_test', '-d', 'copilot_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement])).stdout.trim()
}
async function database(container) {
  await execute('docker', ['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432', '--memory', '256m',
    '-e', 'POSTGRES_USER=copilot_test', '-e', 'POSTGRES_DB=copilot_test', '-e', 'POSTGRES_PASSWORD', databaseImage],
    { env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 180000 })
  started.push(container)
  await until(async () => { try { await sql(container, 'SELECT 1'); return true } catch { return false } }, 'Isolated PostgreSQL did not initialize')
  return (await execute('docker', ['port', container, '5432/tcp'])).stdout.trim().split(':').at(-1)
}
async function json(baseUrl, path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) })
  const text = await response.text()
  assert.ok(response.ok, `${path} HTTP ${response.status}: ${text.slice(0, 1000)}`)
  return text ? JSON.parse(text) : undefined
}
async function syntheticMedia(page) {
  await page.addInitScript(() => {
    const create = async () => {
      const context = new AudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination()
      oscillator.connect(destination); oscillator.start()
      const stream = destination.stream
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => { stop(); try { oscillator.stop() } catch {} void context.close() }
      }
      return stream
    }
    navigator.mediaDevices.getDisplayMedia = create
    navigator.mediaDevices.getUserMedia = create
    window.__operationsSyntheticMedia = true
  })
}
async function beginDesktop() {
  await page.getByRole('button', { name: '开始面试', exact: true }).first().click()
  await until(() => page.evaluate(async () => (await window.copilot.getWallet()).session?.status === 'active'), 'Interview did not enter active state')
  await expect(page.getByRole('textbox', { name: '当前问题' })).toBeVisible()
}
async function check(name, action) { await action(); checks.push(name); process.stdout.write(`PASS ${name}\n`) }
try {
  await mkdir(output, { recursive: true })
  await execute('docker', ['image', 'inspect', databaseImage])
  const businessPort = await database(containers.business)
  const operationsPort = await database(containers.operations)
  await execute('docker', ['cp', join(repository, 'backend/sql'), `${containers.business}:/tmp/sql`])
  const migrations = (await readdir(join(repository, 'backend/sql'))).filter(name => /^\d\d_.*\.sql$/.test(name)).sort()
  for (const migration of migrations) await execute('docker', ['exec', containers.business, 'psql', '-X', '-U', 'copilot_test', '-d', 'copilot_test', '-v', 'ON_ERROR_STOP=1', '-f', `/tmp/sql/${migration}`])
  await execute('docker', ['cp', join(repository, 'backend/sql/operations/01_operations.sql'), `${containers.operations}:/tmp/operations.sql`])
  await execute('docker', ['exec', containers.operations, 'psql', '-X', '-U', 'copilot_test', '-d', 'copilot_test', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/operations.sql'])
  const backendPort = await port(), managementPort = await port()
  const baseUrl = `http://127.0.0.1:${backendPort}`
  // Supported compile-time platform configuration keeps every restarted test app local.
  await execute(process.execPath, [join(frontend, 'node_modules/electron-vite/bin/electron-vite.js'), 'build', '--outDir', join(temporary, 'out')], { cwd: frontend, env: { ...process.env, COPILOT_PLATFORM_URL: baseUrl }, timeout: 120000, maxBuffer: 300000 })
  const packageMetadata = JSON.parse(await readFile(join(frontend, 'package.json'), 'utf8'))
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ ...packageMetadata, main: 'out/main/index.js' }))
  await symlink(join(frontend, 'node_modules'), join(temporary, 'node_modules'), 'dir')
  await symlink(join(frontend, 'scripts'), join(temporary, 'scripts'), 'dir')
  const jar = process.env.OPERATIONS_SMOKE_JAR ?? (await readdir(join(repository, 'backend/target'))).find(name => name.startsWith('copilot-backend-') && name.endsWith('.jar'))
  assert.ok(jar, 'Build latest Java package first')
  const stableJar = join(temporary, 'backend.jar')
  await copyFile(process.env.OPERATIONS_SMOKE_JAR ? jar : join(repository, 'backend/target', jar), stableJar)
  const launchEnvironment = { ...process.env, PORT: String(backendPort), COPILOT_OPERATIONS_MANAGEMENT_PORT: String(managementPort),
    COPILOT_DATABASE_URL: `jdbc:postgresql://127.0.0.1:${businessPort}/copilot_test`, COPILOT_DATABASE_USERNAME: 'copilot_test', COPILOT_DATABASE_PASSWORD: password,
    COPILOT_OPERATIONS_DATABASE_URL: `jdbc:postgresql://127.0.0.1:${operationsPort}/copilot_test`, COPILOT_OPERATIONS_DATABASE_USERNAME: 'copilot_test', COPILOT_OPERATIONS_DATABASE_PASSWORD: password,
    COPILOT_BOOTSTRAP_USERNAME: 'operations-test', COPILOT_BOOTSTRAP_PASSWORD: password, COPILOT_ADMIN_BOOTSTRAP_USERNAME: 'operations-admin', COPILOT_ADMIN_BOOTSTRAP_PASSWORD: password,
    COPILOT_PLATFORM_MASTER_KEY: randomBytes(32).toString('base64'), COPILOT_EMAIL_CODE_SECRET: randomBytes(32).toString('base64'), COPILOT_EMAIL_REGISTRATION_ENABLED: 'false' }
  backend = spawn('java', ['-Xmx384m', `-Dcopilot.references.directory=${join(temporary, 'references')}`, '-jar', stableJar], {
    cwd: repository, env: launchEnvironment, stdio: ['ignore', 'pipe', 'pipe'] })
  backend.stdout.on('data', chunk => { logs = `${logs}${chunk}`.slice(-300000) })
  backend.stderr.on('data', chunk => { logs = `${logs}${chunk}`.slice(-300000) })
  await until(async () => {
    if (backend.exitCode !== null) throw new Error('Backend startup failed; sanitized log written in finally')
    try { return (await sql(containers.business, "SELECT count(*) FROM app_users WHERE display_name IN ('operations-test','operations-admin')")) === '2' } catch { return false }
  }, 'Backend did not initialize isolated users', 60000)
  const admin = await json(baseUrl, '/api/v1/auth/login', undefined, { identifier: 'operations-admin', password, clientType: 'admin' })
  const desktop = await json(baseUrl, '/api/v1/auth/login', undefined, { identifier: 'operations-test', password, clientType: 'desktop' })
  const userId = desktop.user.id
  const benchmarkUsers = []
  if (process.env.OPERATIONS_SMOKE_READY_FILE) {
    for (let index = 0; index < 8; index++) {
      const name = `ops-benchmark-${index}`
      await json(baseUrl, '/api/v1/admin/users', admin.accessToken, { identifier: name, password, availableSeconds: 7200 })
      const login = await json(baseUrl, '/api/v1/auth/login', undefined, { identifier: name, password, clientType: 'desktop' })
      benchmarkUsers.push({ userId: login.user.id, token: login.accessToken })
    }
  }
  await json(baseUrl, '/api/v1/admin/config', admin.accessToken, { version: 0,
    providers: [{ id: 'ops-llm', name: '测试回答', kind: 'llm', url: `${llmUrl}/chat/completions`, enabled: true, apiKey: 'synthetic-platform-key' },
      { id: 'ops-asr', name: '测试转写', kind: 'asr', url: `${mock.asrUrl}?mode=manual`, enabled: true, apiKey: 'synthetic-asr-key' }],
    models: ['mock-fast', 'mock-held'].map(model => ({ id: model, name: model, providerId: 'ops-llm', model, enabled: true, maxOutputTokens: 1024 })),
    defaultModelId: 'mock-fast', asr: { enabled: true, providerId: 'ops-asr', model: 'fun-asr-realtime' },
    knowledge: { enabled: false, providerId: '', agentId: '' }, embedding: { enabled: false, providerId: '', model: '', dimensions: 1024 } }, 'PUT')
  await json(baseUrl, `/api/v1/admin/desktop-settings/users/${userId}`, admin.accessToken, { enabled: true }, 'PUT')
  await json(baseUrl, '/api/v1/admin/desktop-settings', admin.accessToken, { version: 0, llmModelId: 'mock-fast', temperature: 0.7, asrServiceId: 'ops-asr', retrievalMode: 'local', knowledgeServiceId: '' }, 'PUT')
  const opsSettings = await json(baseUrl, '/api/v1/admin/operations/settings', admin.accessToken)
  await json(baseUrl, '/api/v1/admin/operations/settings', admin.accessToken, { ...opsSettings, enabled: true, allowedUserIds: [String(userId), ...benchmarkUsers.map(user => String(user.userId))] }, 'PUT')
  await sql(containers.business, 'INSERT INTO time_wallets(app_users_id,available_seconds) SELECT id,7200 FROM app_users ON CONFLICT(app_users_id) DO UPDATE SET available_seconds=7200')
  if (process.env.OPERATIONS_SMOKE_READY_FILE) {
    for (const user of benchmarkUsers) {
      const resumeId = randomUUID(), environmentId = randomUUID()
      await json(baseUrl, `/api/v1/background/resumes/${resumeId}`, user.token, { version: 0, mutationId: randomUUID(), content: { name: '合成压测简历', text: '合成工程师' } })
      await json(baseUrl, `/api/v1/background/environments/${environmentId}`, user.token, { version: 0, mutationId: randomUUID(), content: { interviewType: 'technical', name: '合成压测环境', resumeId, targetId: null, referenceIds: [], hotwords: [] } })
      await json(baseUrl, `/api/v1/background/environments/${environmentId}/activate`, user.token, {})
      const result = await json(baseUrl, '/api/v1/interview-sessions/start', user.token, { requestId: randomUUID(), environmentId })
      user.sessionId = result.session.id
      user.environmentId = environmentId
    }
    heartbeatTimer = setInterval(() => {
      void Promise.all(benchmarkUsers.map(user => json(baseUrl, `/api/v1/interview-sessions/${user.sessionId}/heartbeat`, user.token, {}))).catch(() => process.stdout.write('Benchmark heartbeat unavailable\n'))
    }, 10000)
    await writeFile(process.env.OPERATIONS_SMOKE_READY_FILE, JSON.stringify({ baseUrl, adminToken: admin.accessToken, benchmarkUsers, userId, backendPid: backend.pid, containers, model: 'mock-fast', startupMigrations: migrations }), { mode: 0o600 })
    process.stdout.write('READY isolated fixture credentials written to owner-only temporary file\n')
    await until(async () => {
      const restartPath = `${process.env.OPERATIONS_SMOKE_READY_FILE}.restart.json`
      try {
        const restart = JSON.parse(await readFile(restartPath, 'utf8'))
        assert.ok(typeof restart.jarPath === 'string' && /^\/tmp\/interview-copilot-operations-(?:release|mpsc)-/.test(restart.jarPath) && restart.jarPath.endsWith('.jar'))
        await rm(restartPath, { force: true })
        clearInterval(heartbeatTimer); heartbeatTimer = undefined
        const previous = backend, backendEnvironment = backend.spawnargs
        previous.kill('SIGTERM')
        await until(() => previous.exitCode !== null, 'Backend restart stop timed out', 12000)
        await copyFile(restart.jarPath, stableJar)
        backend = spawn('java', backendEnvironment.slice(1), { cwd: repository, env: launchEnvironment, stdio: ['ignore', 'pipe', 'pipe'] })
        backend.stdout.on('data', chunk => { logs = `${logs}${chunk}`.slice(-300000) })
        backend.stderr.on('data', chunk => { logs = `${logs}${chunk}`.slice(-300000) })
        await until(async () => { try { return (await fetch(`${baseUrl}/actuator/health`)).ok } catch { return false } }, 'Restarted backend unavailable', 60000)
        for (const user of benchmarkUsers) {
          const wallet = await json(baseUrl, '/api/v1/wallet', user.token)
          if (wallet.session?.status !== 'active') {
            const session = await json(baseUrl, '/api/v1/interview-sessions/start', user.token, { requestId: randomUUID(), environmentId: user.environmentId })
            user.sessionId = session.session.id
          } else await json(baseUrl, `/api/v1/interview-sessions/${user.sessionId}/heartbeat`, user.token, {})
        }
        heartbeatTimer = setInterval(() => { void Promise.all(benchmarkUsers.map(user => json(baseUrl, `/api/v1/interview-sessions/${user.sessionId}/heartbeat`, user.token, {}))).catch(() => process.stdout.write('Benchmark heartbeat unavailable\n')) }, 10000)
        await writeFile(process.env.OPERATIONS_SMOKE_READY_FILE, JSON.stringify({ baseUrl, adminToken: admin.accessToken, benchmarkUsers, userId, backendPid: backend.pid, containers, model: 'mock-fast', startupMigrations: migrations }), { mode: 0o600 })
        process.stdout.write('READY restarted immutable fixture; credentials refreshed in owner-only file\n')
      } catch (error) { if (error?.code !== 'ENOENT') throw error }
      try { await access(`${process.env.OPERATIONS_SMOKE_READY_FILE}.done`); return true } catch { return false }
    }, 'External paired benchmark did not finish', 1800000)
    clearInterval(heartbeatTimer); heartbeatTimer = undefined
  }
  if (process.env.OPERATIONS_SMOKE_FIXTURE_ONLY !== '1') {
  await pause(11000) // Backend collection settings cache intentionally refreshes off the business path.
  const environment = { ...process.env, COPILOT_USER_DATA: join(temporary, 'desktop') }; delete environment.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ executablePath: electronPath, args: [temporary], cwd: frontend, env: environment, timeout: 45000 })
  page = await application.firstWindow(); page.setDefaultTimeout(20000)
  await syntheticMedia(page)
  await page.waitForFunction(() => Boolean(window.copilot))
  await page.evaluate(async ({ baseUrl, password }) => {
    const settings = await window.copilot.getSettings()
    await window.copilot.saveSettings({ ...settings, platform: { enabled: true, baseUrl } })
    await window.copilot.platformLogin({ identifier: 'operations-test', password })
    window.__operationEvents = []; window.copilot.onEvent(event => window.__operationEvents.push(event))
    const library = await window.copilot.saveResume({ name: '合成测试简历', text: '合成工程师，仅用于本地自动化测试。' })
    await window.copilot.saveEnvironment({ ...library.environments.find(item => item.id === library.activeEnvironmentId), resumeId: library.resumes[0].id })
    const configured = await window.copilot.getSettings()
    await window.copilot.saveSettings({ ...configured, retrieval: { enabled: false }, remoteKnowledge: { ...configured.remoteKnowledge, enabled: false },
      serviceSelections: { llm: { source: 'platform', id: 'mock-fast' }, asr: { source: 'platform', id: 'ops-asr' } }, autoAnswer: { enabled: true, pauseMs: 1000 } })
  }, { baseUrl, password })
  await page.reload()
  await page.evaluate(() => { window.__operationEvents = []; window.copilot.onEvent(event => window.__operationEvents.push(event)); return window.copilot.getSettings() })
  await until(() => page.evaluate(() => window.copilot.telemetryEnabled()).catch(() => false), 'Desktop did not enable graylisted collection')
  assert.equal(await page.evaluate(() => window.__operationsSyntheticMedia), true)
  if (process.env.OPERATIONS_SMOKE_STAMP === '1') {
    const stampChecks = await checkEnvironmentStamps(page, application, output)
    checks.push(...stampChecks)
    for (const value of stampChecks) process.stdout.write(`PASS ${value}\n`)
  } else {
  await beginDesktop()
  async function uiAnswer(question) {
    const previous = await page.evaluate(() => window.__operationEvents.filter(event => event.kind === 'answer-done').at(-1)?.requestId)
    await page.getByRole('textbox', { name: '当前问题' }).fill(question)
    await page.getByRole('button', { name: /^生成回答/ }).click()
    await page.waitForFunction(previous => window.__operationEvents.filter(event => event.kind === 'answer-done').at(-1)?.requestId !== previous, previous, { timeout: 20000 })
    await expect(page.getByText('已完成', { exact: true }).last()).toBeVisible()
    return page.evaluate(() => window.__operationEvents.filter(event => event.kind === 'answer-done').at(-1)?.requestId)
  }
  async function traceForRequest(requestId) {
    const rows = await sql(containers.operations, `SELECT DISTINCT operation_id FROM operations_events WHERE payload->>'requestId'='${requestId}'`)
    if (!rows) return undefined
    return json(baseUrl, `/api/v1/admin/operations/traces/${rows.split('\n')[0]}?userId=${userId}`, admin.accessToken)
  }
  let platformTrace
  await check('real Electron UI -> IPC -> Java -> mock provider returns actual token telemetry and committed first text', async () => {
    const requestId = await uiAnswer('synthetic-private-question-platform')
    await until(async () => { platformTrace = await traceForRequest(requestId); return platformTrace?.events.some(event => event.stage === 'answer.first_render') && platformTrace.events.some(event => event.stage === 'session.save') && platformTrace.events.some(event => event.stage === 'session.sync') && platformTrace.events.some(event => event.stage === 'llm.complete' && event.source === 'backend') }, 'Platform trace was incomplete')
    const sources = new Set(platformTrace.events.map(event => event.source))
    assert.ok(sources.has('desktop') && sources.has('backend'))
    assert.ok(platformTrace.events.some(event => event.metadata?.inputTokens === 21 && event.metadata?.outputTokens === 9))
    for (const first of platformTrace.events.filter(event => event.stage === 'llm.first_content')) assert.ok(first.durationMs >= 130, 'Heartbeat or whitespace counted as first text')
    const serialized = JSON.stringify(platformTrace)
    for (const privateValue of [marker, 'synthetic-private-question-platform', 'synthetic-platform-key', password]) assert.equal(serialized.includes(privateValue), false)
  })
  await check('custom supplier receives no operation headers and desktop reports real supplied tokens', async () => {
    await page.evaluate(() => window.copilot.endInterview())
    await page.evaluate(async llmUrl => { await window.copilot.saveCustomService({ name: '本地合成模型', kind: 'llm', url: llmUrl, model: 'mock-fast', apiKey: 'synthetic-custom-key' }) }, llmUrl)
    await beginDesktop()
    const requestId = await uiAnswer('synthetic-private-question-custom')
    let trace
    await until(async () => { trace = await traceForRequest(requestId); return trace?.events.some(event => event.stage === 'llm.complete' && event.metadata?.totalTokens === 30) }, 'Custom supplier trace missing')
    assert.ok(trace.events.some(event => event.serviceSource === 'custom' && event.stage === 'llm.complete'))
    assert.equal(supplierRequests.at(-1).headers['x-operation-id'], undefined)
    assert.equal(supplierRequests.at(-1).headers['x-parent-span-id'], undefined)
  })
  await check('hidden native Electron window continues answer lifecycle and cancellation has a distinct outcome', async () => {
    const previous = await page.evaluate(() => window.__operationEvents.filter(event => event.kind === 'answer-request').at(-1)?.requestId)
    await page.getByRole('textbox', { name: '当前问题' }).fill('synthetic-hidden-question')
    await page.getByRole('button', { name: /^生成回答/ }).click()
    await page.waitForFunction(previous => window.__operationEvents.filter(event => event.kind === 'answer-request').at(-1)?.requestId !== previous, previous)
    const requestId = await page.evaluate(() => window.__operationEvents.filter(event => event.kind === 'answer-request').at(-1).requestId)
    await application.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].hide())
    await until(() => page.evaluate(id => window.__operationEvents.some(event => event.requestId === id && event.kind === 'answer-done'), requestId), 'Hidden answer did not finish')
    await until(async () => (await traceForRequest(requestId))?.events.some(event => event.stage === 'answer.first_render'), 'Hidden committed render telemetry missing')
    await application.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0].show())
    await page.evaluate(() => window.copilot.endInterview())
    await page.evaluate(async () => {
      const settings = await window.copilot.getSettings(), profile = settings.customServices.find(item => item.id === settings.serviceSelections.llm.id)
      await window.copilot.saveCustomService({ ...profile, model: 'mock-held', hasApiKey: undefined })
    })
    await beginDesktop()
    const cancelRequest = randomUUID()
    await page.evaluate(async requestId => window.copilot.generateAnswer({ requestId, operationId: crypto.randomUUID(), question: 'synthetic-cancel-question', transcript: '' }), cancelRequest)
    await until(() => page.evaluate(id => window.__operationEvents.some(event => event.requestId === id && event.kind === 'answer-delta' && event.delta.trim()), cancelRequest), 'Held model did not stream')
    await page.evaluate(() => window.copilot.cancelAnswer())
    await until(async () => (await traceForRequest(cancelRequest))?.events.some(event => event.stage === 'answer.complete' && event.outcome === 'cancelled'), 'Cancelled terminal trace missing')
    assert.ok(supplierRequests.at(-1).cancelled)
    await page.evaluate(() => window.copilot.endInterview())
    await page.evaluate(async () => { const settings = await window.copilot.getSettings(), profile = settings.customServices.find(item => item.id === settings.serviceSelections.llm.id); await window.copilot.saveCustomService({ ...profile, model: 'mock-fast', hasApiKey: undefined }) })
  })
  await beginDesktop()
  await check('actual renderer ASR final transcript triggers automatic wait and filters acknowledgements', async () => {
    await page.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const context = new AudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination()
        oscillator.connect(destination); oscillator.start(); window.__syntheticAudio = { context, oscillator }; return destination.stream
      }
    })
    await page.getByRole('button', { name: '开始转写', exact: true }).click()
    await until(() => mock.asrConnections.length > 0 && mock.asrConnections.at(-1).commands.some(command => command.header?.action === 'run-task'), 'Fake audio ASR did not connect')
    const before = supplierRequests.length
    mock.sendFunAsrSentence(mock.asrConnections.length - 1, { sentenceId: 0, text: '嗯。', endMs: 100 })
    await pause(1500)
    assert.equal(supplierRequests.length, before, 'Acknowledgement wrongly generated an answer')
    mock.sendFunAsrSentence(mock.asrConnections.length - 1, { sentenceId: 1, text: 'synthetic automatic real question?', endMs: 1200 })
    await until(() => supplierRequests.length > before, 'Final ASR question did not auto-trigger')
    await until(async () => Number(await sql(containers.operations, "SELECT count(*) FROM operations_events WHERE stage='answer.auto_wait'")) > 0 && Number(await sql(containers.operations, "SELECT count(*) FROM operations_events WHERE stage='auto.feedback'")) > 0, 'Auto wait or filtered feedback events missing')
    await page.getByRole('button', { name: '停止转写', exact: true }).click()
    await page.evaluate(async () => { window.__syntheticAudio.oscillator.stop(); await window.__syntheticAudio.context.close() })
  })
  if (process.env.OPERATIONS_SMOKE_ELECTRON_BENCH === '1' || process.env.OPERATIONS_SMOKE_ELECTRON_PROFILE === '1') {
    const profiling = process.env.OPERATIONS_SMOKE_ELECTRON_PROFILE === '1'
    const samples = Number(process.env.OPERATIONS_ELECTRON_BENCH_SAMPLES ?? (profiling ? 100 : 200))
    assert.ok(samples >= (profiling ? 50 : 200) && samples <= 500)
    const quantile = (values, percentile) => [...values].sort((left, right) => left - right)[Math.ceil(values.length * percentile) - 1]
    let phase = 0
    async function measureElectron(enabled) {
      await page.evaluate(() => window.copilot.endInterview())
      const current = await json(baseUrl, '/api/v1/admin/operations/settings', admin.accessToken)
      await json(baseUrl, '/api/v1/admin/operations/settings', admin.accessToken, { ...current, enabled }, 'PUT')
      const previousProcess = application.process()
      await application.close(); application = undefined; page = undefined
      await until(() => previousProcess.exitCode !== null, 'Previous Electron process still alive')
      await sql(containers.business, `DELETE FROM session_records WHERE app_users_id=${userId}`)
      await pause(11000) // Collection-cache propagation is initialization, excluded from the measurement.
      application = await _electron.launch({ executablePath: electronPath, args: [temporary], cwd: frontend, env: { ...environment, COPILOT_USER_DATA: join(temporary, `benchmark-desktop-${phase++}`) }, timeout: 45000 })
      page = await application.firstWindow(); page.setDefaultTimeout(20000)
  await syntheticMedia(page)
      await page.waitForFunction(() => Boolean(window.copilot))
      await page.evaluate(async ({ password, baseUrl }) => {
        const before = await window.copilot.getSettings()
        await window.copilot.saveSettings({ ...before, platform: { enabled: true, baseUrl } })
        await window.copilot.platformLogin({ identifier: 'operations-test', password })
        const settings = await window.copilot.getSettings()
        await window.copilot.saveSettings({ ...settings, serviceSelections: { ...settings.serviceSelections, llm: { source: 'platform', id: 'mock-fast' } }, autoAnswer: { ...settings.autoAnswer, enabled: false } })
      }, { password, baseUrl })
      await page.reload()
      await page.evaluate(() => { window.__operationEvents = []; window.copilot.onEvent(event => window.__operationEvents.push(event)); return window.copilot.getSettings() })
      await until(() => page.evaluate(async expected => (await window.copilot.telemetryEnabled()) === expected, enabled).catch(() => false), 'Desktop collection state did not match benchmark mode')
      assert.equal(await page.evaluate(() => window.__operationsSyntheticMedia), true)
      await beginDesktop()
      await page.evaluate(marker => {
        window.__benchMetrics = []
        window.__benchPending = undefined
        document.addEventListener('click', event => {
          const button = event.target instanceof Element ? event.target.closest('button') : null
          if (!button?.textContent?.trim().startsWith('生成回答')) return
          window.__benchPending = { started: performance.now(), article: document.querySelectorAll('article[aria-label^="回答 "]').length + 1 }
        }, true)
        const finish = () => {
          const pending = window.__benchPending
          if (!pending || pending.renderMs === undefined || pending.completeMs === undefined) return
          window.__benchMetrics.push({ requestId: pending.requestId, contextMs: pending.contextMs, requestMs: pending.requestMs, firstMs: pending.firstMs, renderMs: pending.renderMs, completeMs: pending.completeMs, cancelled: pending.cancelled })
          window.__benchPending = undefined
        }
        const observer = new MutationObserver(() => {
          const pending = window.__benchPending
          if (!pending || pending.renderMs !== undefined) return
          const article = document.querySelector(`article[aria-label="回答 ${pending.article}"]`)
          if (article?.textContent?.includes(marker)) { pending.renderMs = performance.now() - pending.started; finish() }
        })
        observer.observe(document.body, { subtree: true, childList: true, characterData: true })
        window.copilot.onEvent(event => {
          const pending = window.__benchPending
          if (!pending) return
          if (event.kind === 'answer-context') pending.contextMs = performance.now() - pending.started
          if (event.kind === 'answer-request') { pending.requestId = event.requestId; pending.requestMs = performance.now() - pending.started }
          if (event.requestId !== pending.requestId) return
          if (event.kind === 'answer-error') { window.__benchError = 'Model request failed'; return }
          if (event.kind === 'answer-delta' && event.delta.trim() && pending.firstMs === undefined) pending.firstMs = performance.now() - pending.started
          if (event.kind === 'answer-done') {
            pending.completeMs = performance.now() - pending.started
            pending.cancelled = event.cancelled
            finish()
          }
        })
      }, marker)
      for (let warmup = 0; warmup < 5; warmup++) {
        await page.getByRole('textbox', { name: '当前问题' }).fill('synthetic-local-electron-benchmark')
        await page.getByRole('button', { name: /^生成回答/ }).click()
        await page.waitForFunction(index => window.__benchMetrics.length > index, warmup)
      }
      await page.evaluate(() => { window.__benchMetrics = [] })
      const sessionId = await page.evaluate(async () => (await window.copilot.getWallet()).session.id)
      assert.match(sessionId, /^[a-f0-9-]{36}$/i)
      const healthBefore = await json(baseUrl, '/api/v1/admin/operations/health', admin.accessToken)
      let cpuTimer, sampler, cpuBefore
      const cpuSamples = []
      if (profiling) {
        const rendererPid = await application.evaluate(({ webContents }) => webContents.getAllWebContents().find(contents => contents.getURL().startsWith('file:')).getOSProcessId())
        const mainPid = application.process().pid
        const takeCpu = async () => {
          const value = (await execute('ps', ['-p', `${mainPid},${rendererPid},${backend.pid}`, '-o', 'pid=,%cpu=,time='])).stdout.trim()
          cpuSamples.push({ at: new Date().toISOString(), value, mainPid, rendererPid, javaPid: backend.pid })
        }
        await takeCpu()
        cpuTimer = setInterval(() => { void takeCpu().catch(() => undefined) }, 2000)
        cpuBefore = await application.evaluate(async ({ webContents }) => {
          const { Session } = process.getBuiltinModule('inspector')
          const session = new Session(); session.connect()
          globalThis.__opsCpuSampler = session
          globalThis.__opsEmitLedger = {}
          globalThis.__opsSendOriginals = webContents.getAllWebContents().map(contents => {
            const original = contents.send.bind(contents)
            contents.send = (channel, event, ...rest) => {
              if (channel === 'copilot:event' && event?.requestId) {
                const row = globalThis.__opsEmitLedger[event.requestId] ??= {}
                if (event.kind === 'answer-context') row.context = performance.now()
                if (event.kind === 'answer-request') row.request = performance.now()
                if (event.kind === 'answer-delta' && event.delta?.trim() && row.first === undefined) row.first = performance.now()
                if (event.kind === 'answer-done') row.done = performance.now()
              }
              return original(channel, event, ...rest)
            }
            return { contents, original }
          })
          const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, value) => error ? reject(error) : resolve(value)))
          await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 1000 }); await post('Profiler.start')
          globalThis.__opsCpuBaseline = process.cpuUsage()
          return globalThis.__opsCpuBaseline
        })
        sampler = await page.context().newCDPSession(page)
        await sampler.send('Profiler.enable'); await sampler.send('Profiler.setSamplingInterval', { interval: 1000 }); await sampler.send('Profiler.start')
        await sampler.send('Tracing.start', { categories: 'devtools.timeline,v8.execute', transferMode: 'ReturnAsStream' })
      }
      const supplierStartIndex = supplierRequests.length
      const measuredSince = new Date().toISOString()
      const started = performance.now()
      for (let index = 0; index < samples; index++) {
        await page.getByRole('textbox', { name: '当前问题' }).fill('synthetic-local-electron-benchmark')
        await page.getByRole('button', { name: /^生成回答/ }).click()
        await page.waitForFunction(index => Boolean(window.__benchError) || window.__benchMetrics.length > index, index, { timeout: 20000 })
        assert.equal(await page.evaluate(() => window.__benchError), undefined)
      }
      const elapsedMs = performance.now() - started
      const metrics = await page.evaluate(() => window.__benchMetrics)
      await writeFile(join(output, `operations-electron-raw-phase-${phase}-${enabled}.json`), JSON.stringify({ enabled, metrics }, null, 2))
      let cpuDiagnostic
      if (profiling) {
        clearInterval(cpuTimer)
        const main = await application.evaluate(async before => {
          const session = globalThis.__opsCpuSampler
          const result = await new Promise((resolve, reject) => session.post('Profiler.stop', (error, result) => error ? reject(error) : resolve(result)))
          session.disconnect(); delete globalThis.__opsCpuSampler
          const emits = globalThis.__opsEmitLedger
          for (const { contents, original } of globalThis.__opsSendOriginals) if (!contents.isDestroyed()) contents.send = original
          delete globalThis.__opsEmitLedger; delete globalThis.__opsSendOriginals
          return { cpu: process.cpuUsage(globalThis.__opsCpuBaseline), profile: result.profile, emits }
        }, cpuBefore)
        const renderer = await sampler.send('Profiler.stop')
        const traceFinished = new Promise(resolve => sampler.once('Tracing.tracingComplete', resolve))
        await sampler.send('Tracing.end')
        const trace = await traceFinished
        const path = join(output, `operations-profile-trace-${phase}-${enabled}.json`)
        await writeFile(path, '')
        while (true) { const chunk = await sampler.send('IO.read', { handle: trace.stream }); await appendFile(path, chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data); if (chunk.eof) break }
        await sampler.send('IO.close', { handle: trace.stream }); await sampler.detach()
        await writeFile(join(output, `operations-profile-main-${phase}-${enabled}.cpuprofile`), JSON.stringify(main.profile))
        await writeFile(join(output, `operations-profile-renderer-${phase}-${enabled}.cpuprofile`), JSON.stringify(renderer.profile))
        cpuDiagnostic = { mainCpuMicros: main.cpu, mainEmitIntervals: Object.entries(main.emits).map(([requestId, value]) => ({ requestId, prepareToRequestMs: value.request - value.context, requestToFirstEmitMs: value.first - value.request, requestToDoneEmitMs: value.done - value.request })), mockSupplierIntervals: supplierRequests.slice(supplierStartIndex).map(value => ({ firstSentMs: value.firstSent - value.started, completedSentMs: value.completedAt - value.started })), sampledProcesses: cpuSamples, inspectorSamplingIntervalMicros: 1000, scope: 'Diagnostic sampling/tracing; not overhead acceptance evidence.' }
      }
      assert.equal(metrics.length, samples)
      assert.ok(metrics.every(value => !value.cancelled && Number.isFinite(value.firstMs) && Number.isFinite(value.renderMs)))
      let collected = { answers: 0, renders: 0, saves: 0, syncs: 0 }
      async function collectedCounts() {
        const values = (await sql(containers.operations, `SELECT count(DISTINCT operation_id) FILTER (WHERE stage='answer.complete'),count(DISTINCT operation_id) FILTER (WHERE stage='answer.first_render'),count(DISTINCT operation_id) FILTER (WHERE stage='session.save'),count(DISTINCT operation_id) FILTER (WHERE stage='session.sync') FROM operations_events WHERE source='desktop' AND session_id='${sessionId}'`)).split('|').map(Number)
        return { answers: values[0], renders: values[1], saves: values[2], syncs: values[3] }
      }
      if (enabled) await until(async () => { collected = await collectedCounts(); return collected.answers === samples + 5 && collected.renders === samples + 5 }, 'Full client answer/render collection did not drain', 30000).catch(async error => { const health = await json(baseUrl, '/api/v1/admin/operations/health', admin.accessToken); await writeFile(join(output, `operations-electron-quality-phase-${phase}-${enabled}.json`), JSON.stringify({ collected, healthBefore, healthAfter: health }, null, 2)); throw error })
      else collected = await collectedCounts()
      const healthAfter = await json(baseUrl, '/api/v1/admin/operations/health', admin.accessToken)
      const dataQuality = { collected, clientDropped: (healthAfter.telemetry.dropReasons.client_reported ?? 0) - (healthBefore.telemetry.dropReasons.client_reported ?? 0), serverDropped: healthAfter.telemetry.dropped - healthBefore.telemetry.dropped, monitorFailures: healthAfter.telemetry.monitorFailures - healthBefore.telemetry.monitorFailures }
      await writeFile(join(output, `operations-electron-quality-phase-${phase}-${enabled}.json`), JSON.stringify(dataQuality, null, 2))
      if (enabled) { assert.ok(collected.saves > 0); assert.ok(collected.syncs > 0) }
      assert.equal(dataQuality.clientDropped, 0)
      assert.equal(dataQuality.serverDropped, 0)
      assert.equal(dataQuality.monitorFailures, 0)
      if (!enabled) assert.equal(collected.answers, 0)
      process.stdout.write(`PASS Electron paired capture=${enabled} samples=${samples} fullCollection=${collected.answers} clientDrop=${dataQuality.clientDropped} monitorFailures=${dataQuality.monitorFailures}\n`)
      const internalStages = enabled && profiling ? await sql(containers.operations, `SELECT source,stage,count(*),percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM operations_events WHERE session_id='${sessionId}' AND started_at >= TIMESTAMP '${measuredSince}' GROUP BY source,stage ORDER BY source,stage`) : undefined
      return { enabled, samples, elapsedMs, dataQuality, cpuDiagnostic, internalStages, preparationP95Ms: quantile(metrics.map(value => value.contextMs), .95), requestP95Ms: quantile(metrics.map(value => value.requestMs), .95), throughput: samples * 1000 / elapsedMs,
        firstContentP95Ms: quantile(metrics.map(value => value.firstMs), .95), firstRenderP95Ms: quantile(metrics.map(value => value.renderMs), .95), completeP95Ms: quantile(metrics.map(value => value.completeMs), .95) }
    }
    const rounds = []
    for (let round = 0; round < (profiling ? 1 : 3); round++) {
      const measurements = round % 2 ? [await measureElectron(true), await measureElectron(false)] : [await measureElectron(false), await measureElectron(true)]
      rounds.push({ off: measurements.find(value => !value.enabled), on: measurements.find(value => value.enabled) })
    }
    const completionP95IncreaseMs = quantile(rounds.map(value => value.on.completeP95Ms - value.off.completeP95Ms), .5)
    const firstP95IncreaseMs = quantile(rounds.map(value => value.on.firstContentP95Ms - value.off.firstContentP95Ms), .5)
    const renderP95IncreaseMs = quantile(rounds.map(value => value.on.firstRenderP95Ms - value.off.firstRenderP95Ms), .5)
    const throughputDecrease = Math.max(0, 1 - rounds.reduce((sum, value) => sum + value.off.elapsedMs, 0) / rounds.reduce((sum, value) => sum + value.on.elapsedMs, 0))
    const allRaw = await Promise.all(Array.from({ length: profiling ? 2 : 6 }, async (_, index) => {
      const enabled = [false, true, true, false, false, true][index]
      return JSON.parse(await readFile(join(output, `operations-electron-raw-phase-${index + 1}-${enabled}.json`), 'utf8'))
    }))
    const pooled = Object.fromEntries([false, true].map(enabled => {
      const values = allRaw.filter(value => value.enabled === enabled).flatMap(value => value.metrics)
      return [enabled ? 'on' : 'off', { samples: values.length, firstContentP95Ms: quantile(values.map(value => value.firstMs), .95), firstRenderP95Ms: quantile(values.map(value => value.renderMs), .95), completeP95Ms: quantile(values.map(value => value.completeMs), .95) }]
    }))
    const pooledP95IncreaseMs = { firstContent: pooled.on.firstContentP95Ms - pooled.off.firstContentP95Ms, firstRender: pooled.on.firstRenderP95Ms - pooled.off.firstRenderP95Ms, complete: pooled.on.completeP95Ms - pooled.off.completeP95Ms }
    const benchmark = { scope: 'Real Electron UI click and React DOM mutation -> preload IPC -> main preparation and disabled RAG branch -> Java authentication/usage/LLM -> local mock SSE. First-render uses MutationObserver after actual React commit, never claims physical screen paint. Excludes nonempty RAG/ASR from the load test; those are separate integration checks.',
      diagnostic: profiling, samplesPerMode: samples * (profiling ? 1 : 3), pooled, pooledP95IncreaseMs, warmupsPerPhase: 5, freshUserDataPerPhase: true, fixtureHistoryResetPerPhase: true, concurrency: 1, rounds, completionP95IncreaseMs, firstP95IncreaseMs, renderP95IncreaseMs, throughputDecrease,
      accepted: Object.values(pooledP95IncreaseMs).every(value => value <= 5) && throughputDecrease <= .02, productionCalled: false }
    await writeFile(join(output, profiling ? 'operations-electron-profile-summary.json' : 'operations-electron-benchmark.json'), JSON.stringify(benchmark, null, 2))
    if (!profiling && benchmark.accepted) checks.push('real Electron paired collection overhead meets configured budget')
    else process.stdout.write('NOT CONFIRMED real Electron overhead budget; all paired and pooled values retained\n')
  }
  await check('monitoring schema remains isolated and storage outage does not stop business answers', async () => {
    assert.equal(await sql(containers.business, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'operations_%'"), '0')
    await execute('docker', ['stop', containers.operations])
    await uiAnswer('synthetic-private-question-storage-outage')
    const settings = await page.evaluate(() => window.copilot.getSettings())
    assert.equal(settings.platform.authenticated, true)
    assert.ok((await fetch(`${baseUrl}/api/v1/admin/operations/health`, { headers: { Authorization: `Bearer ${admin.accessToken}` }, signal: AbortSignal.timeout(5000) })).ok)
  })
  await page.screenshot({ path: join(output, 'operations-electron.png') })
  }
  }
} finally {
  clearInterval(heartbeatTimer)
  await page?.screenshot({ path: join(output, 'operations-electron.png') }).catch(() => undefined)
  await application?.close().catch(() => undefined)
  if (backend?.exitCode === null) { backend.kill('SIGTERM'); await until(() => backend.exitCode !== null, 'Backend shutdown', 10000).catch(() => backend.kill('SIGKILL')) }
  for (const container of started) await execute('docker', ['rm', '-f', container]).catch(() => undefined)
  supplier.closeAllConnections(); await new Promise(resolve => supplier.close(resolve)); await mock.close()
  for (const secret of [password, 'synthetic-platform-key', 'synthetic-custom-key', 'synthetic-asr-key']) logs = logs.replaceAll(secret, '[redacted]')
  await writeFile(join(output, 'operations-electron-backend.log'), logs)
  if (process.env.OPERATIONS_SMOKE_FIXTURE_ONLY !== '1') await writeFile(join(output, process.env.OPERATIONS_SMOKE_STAMP === '1' ? 'environment-stamp-report.json' : 'operations-electron-report.json'), JSON.stringify({ realElectron: true, realJava: true, businessDatabase: 'PostgreSQL 15.19/pgvector0.8.6', independentOperationsDatabase: true, realProviderTested: false, realAudioTested: false, syntheticAudio: true, checks }, null, 2))
  await rm(temporary, { recursive: true, force: true })
  if (process.env.OPERATIONS_SMOKE_READY_FILE) {
    await rm(process.env.OPERATIONS_SMOKE_READY_FILE, { force: true })
    await rm(`${process.env.OPERATIONS_SMOKE_READY_FILE}.done`, { force: true })
  }
}
