import http from 'node:http'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import { startMockServices } from './mock-services.mjs'

const execute = promisify(execFile)
const frontend = dirname(dirname(fileURLToPath(import.meta.url)))
const repository = dirname(frontend)
const output = join(frontend, 'test-results')
const userData = await mkdtemp(join(tmpdir(), 'copilot-platform-e2e-'))
const suffix = randomBytes(6).toString('hex')
const container = `copilot-platform-e2e-${suffix}`
const databaseImage = 'interview-copilot-postgres:15.19-pgvector0.8.6'
const password = randomBytes(20).toString('hex')
const keys = { llm: `test-platform-llm-${suffix}`, asr: `test-platform-asr-${suffix}`, embedding: `test-platform-embedding-${suffix}` }
const report = { realProviderTested: false, realAudioTested: false, checks: [], screenshots: [] }
const mock = await startMockServices()
const webCalls = []
const web = http.createServer(async (request, response) => {
  let raw = ''; for await (const part of request) raw += part
  webCalls.push(JSON.parse(raw))
  response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ results: [
    { title: '网页缓存说明', url: 'https://example.test/cache', content: '联网参考：Redis 缓存热点采用互斥锁。', score: 0.9 },
    { title: '网页限流说明', url: 'https://example.test/rate', content: '联网参考：限流保护数据库。', score: 0.8 },
  ] }))
})
await new Promise(resolve => web.listen(0, '127.0.0.1', resolve))
let application
let backend
let page
let logs = ''
let databaseStarted = false

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
async function until(predicate, message, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await pause(100)
  }
  throw new Error(message)
}
async function port() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const value = server.address().port
  await new Promise(resolve => server.close(resolve))
  return value
}
async function check(name, operation) {
  await operation()
  if (page) await page.evaluate(() => window.copilot.endInterview()).catch(() => undefined)
  report.checks.push(name)
  process.stdout.write(`PASS ${name}\n`)
}
function noSecrets(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const key of Object.values(keys)) assert.equal(serialized.includes(key), false)
}
async function request(baseUrl, path, body, token) {
  return fetch(`${baseUrl}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) })
}
async function beginDesktop() {
  await page.evaluate(async () => { const wallet = await window.copilot.getWallet(); if (wallet.session?.status !== 'active') await window.copilot.startInterview(crypto.randomUUID(), (await window.copilot.getInterviewLibrary()).activeEnvironmentId) })
}
async function answer(question) {
  await beginDesktop()
  const requestId = `answer-${randomBytes(8).toString('hex')}`
  await page.evaluate(async ({ requestId, question }) => {
    await window.copilot.generateAnswer({ requestId, question, transcript: question })
  }, { requestId, question })
  await page.waitForFunction(id => window.__platformEvents.some(event => event.requestId === id
    && ['answer-done', 'answer-error'].includes(event.kind)), requestId, { timeout: 20000 })
  const events = await page.evaluate(id => window.__platformEvents.filter(event => event.requestId === id), requestId)
  const error = events.find(event => event.kind === 'answer-error')
  assert.equal(error, undefined, JSON.stringify(error))
  await page.evaluate(() => window.copilot.endInterview())
  return events
}

try {
  await mkdir(output, { recursive: true })
  const artifacts = (await readdir(join(repository, 'backend/target'))).filter(name => name.endsWith('.jar'))
  assert.equal(artifacts.length, 1, 'Build backend with npm run backend:build before the smoke test')
  await execute('docker', ['image', 'inspect', databaseImage]).catch(() => {
    throw new Error('Build the database image first: docker build -t interview-copilot-postgres:15.19-pgvector0.8.6 deploy/postgres')
  })
  await execute('docker', ['run', '--rm', '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_USER=copilot_test', '-e', 'POSTGRES_DB=copilot_test', '-e', 'POSTGRES_PASSWORD', databaseImage],
  { env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 180000 })
  databaseStarted = true
  await until(async () => {
    try { await execute('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'copilot_test', '-d', 'copilot_test']); return true }
    catch { return false }
  }, 'Test database did not become ready')
  await execute('docker', ['cp', join(repository, 'backend/sql'), `${container}:/tmp/copilot-sql`])
  await execute('docker', ['exec', container, 'psql', '-X', '-U', 'copilot_test', '-d', 'copilot_test',
    '-v', 'ON_ERROR_STOP=1', '--single-transaction',
    '-f', '/tmp/copilot-sql/01_schema.sql', '-f', '/tmp/copilot-sql/02_pgvector.sql',
    '-f', '/tmp/copilot-sql/03_admin_users.sql', '-f', '/tmp/copilot-sql/04_platform_config.sql', '-f', '/tmp/copilot-sql/05_email_auth.sql', '-f', '/tmp/copilot-sql/06_display_name.sql', '-f', '/tmp/copilot-sql/07_email_code_purpose.sql', '-f', '/tmp/copilot-sql/08_server_local_time.sql', '-f', '/tmp/copilot-sql/09_pg_references.sql', '-f', '/tmp/copilot-sql/10_time_wallet.sql', ...['11_payment_packages.sql','12_alipay_payments.sql','13_session_records.sql','14_server_background.sql','15_user_preferences.sql','16_desktop_sessions.sql','17_desktop_settings.sql','18_invitations.sql','19_client_downloads.sql','20_alipay_page_pay.sql','21_zpay_payments.sql','22_zpay_api_qr.sql','23_interview_type.sql','24_operations_statistics.sql','25_reference_hybrid.sql'].flatMap(name => ['-f', `/tmp/copilot-sql/${name}`])])
  const mapping = (await execute('docker', ['port', container, '5432/tcp'])).stdout.trim()
  const databasePort = mapping.slice(mapping.lastIndexOf(':') + 1)
  const backendPort = await port()
  const baseUrl = `http://127.0.0.1:${backendPort}`
  backend = spawn('java', [`-Dcopilot.references.directory=${join(userData, 'server-references')}`, '-jar', join(repository, 'backend/target', artifacts[0])], { cwd: repository,
    env: { ...process.env, PORT: String(backendPort), COPILOT_DATABASE_URL: `jdbc:postgresql://127.0.0.1:${databasePort}/copilot_test`,
      COPILOT_DATABASE_USERNAME: 'copilot_test', COPILOT_DATABASE_PASSWORD: password,
      COPILOT_BOOTSTRAP_USERNAME: 'platform-test', COPILOT_BOOTSTRAP_PASSWORD: password,
      COPILOT_ADMIN_BOOTSTRAP_USERNAME: 'admin-test', COPILOT_ADMIN_BOOTSTRAP_PASSWORD: password,
      COPILOT_PLATFORM_MASTER_KEY: randomBytes(32).toString('base64'),
      COPILOT_EMAIL_CODE_SECRET: randomBytes(32).toString('base64'), COPILOT_EMAIL_REGISTRATION_ENABLED: 'true',
    }, stdio: ['ignore', 'pipe', 'pipe'] })
  backend.stdout.on('data', value => { logs = `${logs}${value}`.slice(-300000) })
  backend.stderr.on('data', value => { logs = `${logs}${value}`.slice(-300000) })
  await until(async () => {
    if (backend.exitCode !== null) throw new Error('Backend exited; inspect the sanitized hybrid-smoke-backend.log')
    try { return (await fetch(`${baseUrl}/actuator/health`)).ok } catch { return false }
  }, 'Backend did not become healthy', 60000)
  // Health can turn UP before the bootstrap ApplicationRunners finish creating both accounts.
  await until(async () => {
    if (backend.exitCode !== null) throw new Error('Backend exited before test accounts were initialized')
    const initialized = await execute('docker', ['exec', container, 'psql', '-X', '-U', 'copilot_test', '-d', 'copilot_test', '-At',
      '-c', "SELECT count(*) FROM app_users WHERE is_enabled AND ((display_name = 'platform-test' AND role = 'USER') OR (display_name = 'admin-test' AND role = 'ADMIN'))"])
    return initialized.stdout.trim() === '2'
  }, 'Backend bootstrap did not initialize both test accounts')

  const adminLogin = await request(baseUrl, '/api/v1/auth/login', { identifier: 'admin-test', password, clientType: 'admin' })
  assert.equal(adminLogin.status, 200)
  const adminToken = (await adminLogin.json()).accessToken
  async function publishConfig(path, body) {
    const response = await fetch(`${baseUrl}/api/v1/admin/${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify(body) })
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }
  await publishConfig('config', { version: 0, providers: [
    { id: 'llm', name: '测试模型', kind: 'llm', url: `${mock.llmBaseUrl}/chat/completions`, enabled: true, apiKey: keys.llm },
    { id: 'asr', name: '测试转写', kind: 'asr', url: mock.asrUrl, enabled: true, apiKey: keys.asr },
    { id: 'embedding', name: '测试向量', kind: 'embedding', url: `${mock.llmBaseUrl}/embeddings`, enabled: true, apiKey: keys.embedding },
    { id: 'web', name: '测试联网', kind: 'web-search', url: `http://127.0.0.1:${web.address().port}/search`, enabled: true, apiKey: 'test-only-web' },
  ], models: [{ id: 'mock-fast', name: '测试模型', providerId: 'llm', model: 'mock-fast', enabled: true, maxOutputTokens: 2048 }], defaultModelId: 'mock-fast',
    asr: { enabled: true, providerId: 'asr', model: 'fun-asr-realtime' }, embedding: { enabled: true, providerId: 'embedding', model: 'mock-embedding', dimensions: 1024 },
    webSearch: { enabled: true, providerId: 'web', topK: 2, searchDepth: 'basic', timeoutMs: 8000, includeAnswer: 'none' },
  })
  const policy = await (await request(baseUrl, '/api/v1/admin/reference-policy', undefined, adminToken)).json()
  const saved = await fetch(`${baseUrl}/api/v1/admin/reference-policy`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ ...policy, hybridEnabled: true, cacheEnabled: true }) })
  assert.equal(saved.status, 204, await saved.text())
  const user = { id: (await execute('docker', ['exec', container, 'psql', '-At', '-U', 'copilot_test', '-d', 'copilot_test', '-c', "SELECT id FROM app_users WHERE display_name='platform-test' AND role='USER'"])).stdout.trim() }; assert.ok(user.id)
  const grant = await fetch(`${baseUrl}/api/v1/admin/desktop-settings/users/${user.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ enabled: true }) }); assert.equal(grant.status, 204)
  await execute('docker', ['exec', container, 'psql', '-U', 'copilot_test', '-d', 'copilot_test', '-c', 'INSERT INTO time_wallets(app_users_id,available_seconds) SELECT id,7200 FROM app_users ON CONFLICT(app_users_id) DO UPDATE SET available_seconds=7200'])
  const environment = { ...process.env, COPILOT_USER_DATA: userData }; delete environment.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ executablePath: electronPath, args: ['.'], cwd: frontend, env: environment, timeout: 45000 })
  page = await application.firstWindow(); await page.waitForFunction(() => Boolean(window.copilot))
  await page.evaluate(async ({ baseUrl, password }) => { const settings = await window.copilot.getSettings(); await window.copilot.saveSettings({ ...settings, platform: { enabled: true, baseUrl } }); await window.copilot.platformLogin({ identifier: 'platform-test', password }); window.__platformEvents = []; window.copilot.onEvent(event => window.__platformEvents.push(event)) }, { baseUrl, password })
  const file = join(userData, 'cache.md'); await writeFile(file, '# 缓存设计\n技术背景。\n## 缓存击穿\nRedis 热点缓存过期，大量请求访问数据库时，使用互斥锁及逻辑过期。\n## 缓存雪崩\nRedis 大量缓存同时过期，使用随机过期时间和限流保护数据库。\n## 缓存一致性\nRedis 与数据库更新需要考虑一致性。\n## 消息队列\n使用 Kafka 消息队列。\n')
  await application.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }) }, file)
  const docs = await page.evaluate(() => window.copilot.importReferences()); assert.equal(docs.length, 1); const id = docs[0].id
  await check('MD builds heading parents and both lexical/vector indexes', async () => {
    await until(async () => (await page.evaluate(() => window.copilot.listReferences()))[0]?.status === 'ready', 'reference index readiness')
    const document = (await page.evaluate(() => window.copilot.listReferences()))[0]
    assert.equal(document.headingMode, 'headings'); assert.ok(document.contextCount >= 4); assert.equal(document.splitterVersion, 1)
    const preview = await page.evaluate(id => window.copilot.previewReference(id), id); assert.ok(preview.text.includes('热点缓存过期'))
  })
  await page.evaluate(async id => { const resumes = await window.copilot.saveResume({ name: '合成候选人', text: '这是自动化测试使用的合成简历。' }); const resume = resumes.resumes.find(value => value.name === '合成候选人'); const library = await window.copilot.saveEnvironment({ name: '混合检索验证', interviewType: 'technical', resumeId: resume.id, targetId: null, referenceIds: [id] }); await window.copilot.activateEnvironment(library.environments.find(value => value.name === '混合检索验证').id); const settings = await window.copilot.getSettings(); await window.copilot.saveSettings({ ...settings, serviceSelections: { ...settings.serviceSelections, llm: { source: 'platform', id: 'mock-fast' }, asr: { source: 'platform', id: 'asr' } }, retrieval: { enabled: true }, webSearch: { enabled: true } }) }, id)
  await check('Top5 + Top5 fuse distinct Top3 parents and join web content in real model request', async () => {
    const events = await answer('Redis 热点缓存过期如何保护数据库？')
    const retrieval = events.find(event => event.kind === 'answer-context').retrieval
    assert.ok(retrieval.hybrid.bm25.candidateCount <= 5); assert.ok(retrieval.hybrid.vector.candidateCount <= 5)
    const local = retrieval.excerpts.filter(value => value.source === 'platform'); assert.ok(local.length > 0 && local.length <= 3)
    assert.equal(new Set(local.map(value => value.chunkId)).size, local.length)
    assert.ok(local.some(value => value.ranking.bm25Rank && value.ranking.vectorRank))
    assert.equal(retrieval.excerpts.filter(value => value.source === 'web').length, 2)
    const input = JSON.parse(events.find(event => event.kind === 'answer-request').modelInput.messages[1].content).referenceContext
    assert.equal(input.length, local.length + 2); assert.ok(input.every(value => !('ranking' in value))); assert.ok(input.some(value => value.text.includes('联网参考')))
    assert.ok(webCalls.length > 0)
    await page.screenshot({ path: join(output, 'hybrid-answer.png') })
  })
  await check('embedding failure preserves BM25 and web with an explicit downgrade', async () => {
    mock.setEmbeddingMode('error')
    const retrieval = (await answer('Redis 热点缓存过期如何保护数据库？')).find(event => event.kind === 'answer-context').retrieval
    assert.equal(retrieval.hybrid.vector.status, 'degraded'); assert.equal(retrieval.hybrid.bm25.status, 'ready'); assert.equal(retrieval.status, 'degraded')
    assert.ok(retrieval.excerpts.some(value => value.source === 'platform')); assert.ok(retrieval.excerpts.some(value => value.source === 'web'))
    mock.setEmbeddingMode('fast')
  })
  await check('disabled documents never return cached parent content', async () => {
    await beginDesktop()
    await page.evaluate(id => window.copilot.updateReference(id, { enabled: false }), id)
    const retrieval = (await answer('Redis 热点缓存过期如何保护数据库？')).find(event => event.kind === 'answer-context').retrieval
    assert.equal(retrieval.excerpts.filter(value => value.source === 'platform').length, 0)
    assert.equal(retrieval.excerpts.filter(value => value.source === 'web').length, 2)
  })
  await check('Binary Word upload builds the same parent-child indexes', async () => {
    const word = join(userData, 'word.doc')
    await writeFile(word, await readFile(join(repository, 'backend/src/test/resources/references/simple.doc')))
    await application.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }) }, word)
    const imported = await page.evaluate(() => window.copilot.importReferences())
    const document = imported.find(value => value.name === 'word.doc'); assert.ok(document)
    await until(async () => (await page.evaluate(() => window.copilot.listReferences())).find(value => value.id === document.id)?.status === 'ready', 'Word index readiness')
    const ready = (await page.evaluate(() => window.copilot.listReferences())).find(value => value.id === document.id)
    assert.equal(ready.format, 'doc'); assert.ok(ready.contextCount > 0); assert.ok(ready.chunkCount > 0)
  })
  await check('Failed first embedding batch preserves HTTP status without publishing or exposing supplier body', async () => {
    mock.setEmbeddingMode('error')
    const failedFile = join(userData, 'failed-index.md')
    await writeFile(failedFile, '# 合成失败测试\n只用于自动化验证。')
    await application.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }) }, failedFile)
    const imported = await page.evaluate(() => window.copilot.importReferences())
    const document = imported.find(value => value.name === 'failed-index.md'); assert.ok(document)
    await until(async () => (await page.evaluate(() => window.copilot.listReferences())).find(value => value.id === document.id)?.status === 'error', 'Failed index diagnostic readiness')
    const failed = (await page.evaluate(() => window.copilot.listReferences())).find(value => value.id === document.id)
    assert.ok(failed.indexError.includes('HTTP 503'))
    assert.equal(failed.revision, 0); assert.equal(failed.chunkCount, 0)
    assert.equal(failed.indexError.includes('模拟向量服务'), false); noSecrets(failed)
    mock.setEmbeddingMode('fast')
  })
  report.passed = true
} finally {
  await application?.close().catch(() => undefined)
  if (backend && backend.exitCode === null) {
    backend.kill('SIGTERM')
    await until(() => backend.exitCode !== null, 'Backend stop timeout', 10000).catch(() => backend.kill('SIGKILL'))
  }
  if (databaseStarted) await execute('docker', ['rm', '-f', container]).catch(() => undefined)
  await new Promise(resolve => web.close(resolve))
  await mock.close()
  for (const secret of [...Object.values(keys), password]) logs = logs.replaceAll(secret, '[redacted]')
  await writeFile(join(output, 'hybrid-smoke-backend.log'), logs)
  await writeFile(join(output, 'hybrid-smoke-report.json'), JSON.stringify(report, null, 2))
  await rm(userData, { recursive: true, force: true })
}
