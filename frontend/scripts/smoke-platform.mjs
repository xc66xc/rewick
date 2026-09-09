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
import { startRemoteKnowledgeMock, remoteMarker, remoteMetadataMarkers } from './mock-remote-knowledge.mjs'
import { runAdminPlatformChecks } from '../tests/e2e/admin-platform.mjs'
import { startSmtpMock } from './mock-smtp.mjs'
import { checkServiceSelectors } from '../tests/e2e/service-selectors.mjs'

const execute = promisify(execFile)
const frontend = dirname(dirname(fileURLToPath(import.meta.url)))
const repository = dirname(frontend)
const output = join(frontend, 'test-results')
const userData = await mkdtemp(join(tmpdir(), 'copilot-platform-e2e-'))
const suffix = randomBytes(6).toString('hex')
const container = `copilot-platform-e2e-${suffix}`
const databaseImage = 'interview-copilot-postgres:15.19-pgvector0.5.1'
const password = randomBytes(20).toString('hex')
const keys = { llm: `test-platform-llm-${suffix}`, asr: `test-platform-asr-${suffix}`, knowledge: `test-platform-knowledge-${suffix}` }
const report = { realProviderTested: false, realAudioTested: false, checks: [], screenshots: [] }
const mock = await startMockServices()
const knowledge = await startRemoteKnowledgeMock()
const smtp = await startSmtpMock()
let application
let backend
let adminServer
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
async function answer(question) {
  const requestId = `answer-${randomBytes(8).toString('hex')}`
  await page.evaluate(async ({ requestId, question }) => {
    await window.copilot.generateAnswer({ requestId, question, transcript: question })
  }, { requestId, question })
  await page.waitForFunction(id => window.__platformEvents.some(event => event.requestId === id
    && ['answer-done', 'answer-error'].includes(event.kind)), requestId, { timeout: 20000 })
  const events = await page.evaluate(id => window.__platformEvents.filter(event => event.requestId === id), requestId)
  const error = events.find(event => event.kind === 'answer-error')
  assert.equal(error, undefined, JSON.stringify(error))
  return events
}

try {
  await mkdir(output, { recursive: true })
  const artifacts = (await readdir(join(repository, 'backend/target'))).filter(name => name.endsWith('.jar'))
  assert.equal(artifacts.length, 1, 'Build backend with npm run backend:build before the smoke test')
  await execute('docker', ['image', 'inspect', databaseImage]).catch(() => {
    throw new Error('Build the database image first: docker build -t interview-copilot-postgres:15.19-pgvector0.5.1 deploy/postgres')
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
    '-f', '/tmp/copilot-sql/03_admin_users.sql', '-f', '/tmp/copilot-sql/04_platform_config.sql', '-f', '/tmp/copilot-sql/05_email_auth.sql', '-f', '/tmp/copilot-sql/06_display_name.sql'])
  const mapping = (await execute('docker', ['port', container, '5432/tcp'])).stdout.trim()
  const databasePort = mapping.slice(mapping.lastIndexOf(':') + 1)
  const backendPort = await port()
  const baseUrl = `http://127.0.0.1:${backendPort}`
  backend = spawn('java', ['-jar', join(repository, 'backend/target', artifacts[0])], { cwd: repository,
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
    if (backend.exitCode !== null) throw new Error('Backend exited; inspect the sanitized platform-smoke-backend.log')
    try { return (await fetch(`${baseUrl}/actuator/health`)).ok } catch { return false }
  }, 'Backend did not become healthy', 60000)
  // Health can turn UP before the bootstrap ApplicationRunners finish creating both accounts.
  await until(async () => {
    if (backend.exitCode !== null) throw new Error('Backend exited before test accounts were initialized')
    const initialized = await execute('docker', ['exec', container, 'psql', '-X', '-U', 'copilot_test', '-d', 'copilot_test', '-At',
      '-c', "SELECT count(*) FROM app_users WHERE is_enabled AND ((display_name = 'platform-test' AND role = 'USER') OR (display_name = 'admin-test' AND role = 'ADMIN'))"])
    return initialized.stdout.trim() === '2'
  }, 'Backend bootstrap did not initialize both test accounts')

  const adminLogin = await request(baseUrl, '/api/v1/auth/login', { identifier: 'admin-test', password })
  assert.equal(adminLogin.status, 200)
  const adminToken = (await adminLogin.json()).accessToken
  async function publishConfig(path, body) {
    const response = await fetch(`${baseUrl}/api/v1/admin/${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify(body) })
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }
  await check('provider and SMTP connections are published to the database without YAML addresses', async () => {
    assert.equal((await (await request(baseUrl, '/api/v1/platform', undefined, adminToken)).json()).capabilities.llm, false)
    await publishConfig('config', { version: 0,
      providers: [
        { id: 'initial-llm', name: '平台回答', kind: 'llm', url: `${mock.llmBaseUrl}/chat/completions`, enabled: true, apiKey: keys.llm },
        { id: 'initial-asr', name: '平台转写', kind: 'asr', url: `${mock.asrUrl}?mode=manual`, enabled: true, apiKey: keys.asr },
        { id: 'initial-knowledge', name: '平台知识库', kind: 'knowledge', url: knowledge.url, enabled: true, apiKey: keys.knowledge },
      ],
      models: ['mock-fast', 'mock-held'].map(model => ({ id: model, name: model, providerId: 'initial-llm', model, enabled: true, maxOutputTokens: 2048 })),
      defaultModelId: 'mock-fast', asr: { enabled: true, providerId: 'initial-asr', model: 'fun-asr-realtime' },
      knowledge: { enabled: true, providerId: 'initial-knowledge', agentId: 'aid-server-only' },
    })
    await publishConfig('email-config', { version: 0, enabled: true, host: '127.0.0.1', port: smtp.port, username: '', from: 'copilot@example.test', startTls: false, ssl: false })
  })

  await check('explicit SQL initializes PostgreSQL 15.19 and pgvector 0.5.1 before backend startup', async () => {
    const result = await execute('docker', ['exec', container, 'psql', '-U', 'copilot_test', '-d', 'copilot_test', '-At',
      '-c', "SELECT current_setting('server_version_num'), extversion FROM pg_extension WHERE extname = 'vector'"])
    assert.equal(result.stdout.trim(), '150019|0.5.1')
    const history = await execute('docker', ['exec', container, 'psql', '-U', 'copilot_test', '-d', 'copilot_test', '-At',
      '-c', "SELECT to_regclass('public.flyway_schema_history') IS NULL"])
    assert.equal(history.stdout.trim(), 't')
    report.database = { postgres: '15.19', pgvector: '0.5.1' }
  })

  await check('platform requires business authentication and rejects invalid login', async () => {
    assert.equal((await request(baseUrl, '/api/v1/platform')).status, 401)
    assert.equal((await request(baseUrl, '/api/v1/auth/login', { identifier: 'platform-test', password: 'wrong-password' })).status, 401)
  })
  const loginResponse = await request(baseUrl, '/api/v1/auth/login', { identifier: 'platform-test', password })
  assert.equal(loginResponse.status, 200)
  const { accessToken } = await loginResponse.json()
  await check('metadata contains public capabilities without platform secrets', async () => {
    const response = await request(baseUrl, '/api/v1/platform', undefined, accessToken)
    assert.equal(response.status, 200)
    const info = await response.json()
    assert.deepEqual(info.capabilities, { llm: true, asr: true, knowledge: true })
    assert.equal(info.models.llm, 'mock-fast')
    noSecrets(info)
  })
  await check('server rejects caller-controlled upstream URLs and models', async () => {
    for (const extra of [{ url: mock.llmBaseUrl }, { model: 'unapproved-model' }]) {
      const response = await request(baseUrl, '/api/v1/llm/chat/completions', {
        model: 'mock-fast', messages: [{ role: 'user', content: 'hello' }], stream: false, ...extra,
      }, accessToken)
      assert.equal(response.status, 400)
      noSecrets(await response.text())
    }
    assert.equal(mock.requests.length, 0)
  })
  await check('cancelling SSE closes the upstream and a repeated request ID is rejected', async () => {
    const requestId = `cancel-${suffix}`
    const body = { model: 'mock-held', messages: [{ role: 'user', content: 'cancel test' }], stream: true }
    const controller = new AbortController()
    const response = await fetch(`${baseUrl}/api/v1/llm/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'X-Request-Id': requestId },
      body: JSON.stringify(body), signal: controller.signal,
    })
    assert.equal(response.status, 200)
    const reader = response.body.getReader()
    assert.equal((await reader.read()).done, false)
    controller.abort()
    await reader.cancel().catch(() => undefined)
    await until(() => mock.requests.at(-1).cancelled, 'Cancelled SSE kept its upstream running', 15000)
    const repeated = await fetch(`${baseUrl}/api/v1/llm/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'X-Request-Id': requestId },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    })
    assert.equal(repeated.status, 409)
  })

  const environment = { ...process.env, COPILOT_USER_DATA: userData }
  delete environment.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ executablePath: electronPath, args: ['.'], cwd: frontend, env: environment, timeout: 45000 })
  page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  await page.waitForFunction(() => Boolean(window.copilot))
  await page.evaluate(async baseUrl => {
    const settings = await window.copilot.getSettings()
    await window.copilot.saveSettings({ ...settings, platform: { enabled: true, baseUrl } })
    window.__platformEvents = []
    window.copilot.onEvent(event => window.__platformEvents.push(event))
  }, baseUrl)

  await check('Electron requires verified email registration before entering the workspace and keeps tokens private', async () => {
    await expect(page.getByRole('heading', { name: '登录面试工作台' })).toBeVisible()
    await assert.rejects(page.evaluate(() => window.copilot.getHistory()), /注册或登录/)
    await assert.rejects(page.evaluate(() => window.copilot.startAsr()), /注册或登录/)
    await page.getByRole('tab', { name: '注册账号' }).click()
    await page.getByLabel('邮箱', { exact: true }).fill('desktop@example.test')
    await page.getByLabel('密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '发送验证码', exact: true }).click()
    await until(() => smtp.messages.length === 1, 'Registration mail did not reach isolated SMTP sink')
    await expect(page.getByRole('button', { name: /秒后重发/ })).toBeDisabled()
    await page.getByRole('textbox', { name: /邮箱验证码/ }).fill(smtp.code())
    await page.getByRole('button', { name: '注册并登录', exact: true }).click()
    await expect(page.getByRole('button', { name: '打开设置', exact: true })).toBeVisible()
    const settings = await page.evaluate(() => window.copilot.getSettings())
    assert.equal(settings.platform.authenticated, true)
    assert.equal(settings.platform.user.email, 'desktop@example.test')
    assert.equal(JSON.stringify(settings).includes(accessToken), false)
    assert.equal(JSON.stringify(settings).includes(password), false)
    noSecrets(settings)
    await page.screenshot({ path: join(output, 'platform-settings.png') })
    report.screenshots.push('platform-settings.png')
  })

  await checkServiceSelectors({ page, mock, knowledge, check })

  await check('Electron question produces streamed answer through Java with server-owned Key', async () => {
    await page.getByRole('textbox', { name: '当前问题' }).fill('请介绍一下数据库索引。')
    await page.getByRole('button', { name: '生成回答', exact: true }).click()
    await expect(page.getByText('已完成', { exact: true }).last()).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('textbox', { name: '当前问题' })).toHaveValue('')
    assert.equal(mock.requests.at(-1).authorization, `Bearer ${keys.llm}`)
    const events = await page.evaluate(() => window.__platformEvents)
    assert.ok(events.filter(event => event.kind === 'answer-delta').length > 1)
    assert.equal(events.find(event => event.kind === 'answer-request').modelInput.model, 'mock-fast')
    noSecrets(events)
    await page.screenshot({ path: join(output, 'platform-answer.png') })
    report.screenshots.push('platform-answer.png')
  })

  await check('platform RAG sends only text to model and uses server Agent ID', async () => {
    await page.evaluate(async () => {
      const settings = await window.copilot.getSettings()
      await window.copilot.saveSettings({ ...settings, remoteKnowledge: { enabled: true, url: '', agentId: '' } })
    })
    const events = await answer('Redis 缓存一致性怎么保证？')
    assert.equal(knowledge.requests.at(-1).body.agent_id, 'aid-server-only')
    assert.equal(knowledge.requests.at(-1).authorization, `Bearer ${keys.knowledge}`)
    const sent = JSON.stringify(mock.requests.at(-1).body)
    assert.ok(sent.includes(remoteMarker))
    for (const marker of Object.values(remoteMetadataMarkers)) assert.equal(sent.includes(String(marker)), false)
    noSecrets(events)
  })

  await check('remote failure continues model answer with degraded retrieval', async () => {
    knowledge.setMode('http-error')
    const events = await answer('远程检索失败时继续回答。')
    assert.equal(events.find(event => event.kind === 'answer-context').retrieval.status, 'degraded')
    assert.ok(events.some(event => event.kind === 'answer-done'))
    knowledge.setMode('ready')
  })

  await check('PCM and final transcript cross the authenticated Java WebSocket relay', async () => {
    const { sessionId } = await page.evaluate(() => window.copilot.startAsr())
    await page.evaluate(id => window.copilot.sendAudio(id, new Uint8Array([1, 0, 2, 0]).buffer), sessionId)
    await until(() => mock.asrConnections.length > 0 && mock.asrConnections.at(-1).audioBytes === 4, 'Audio did not reach fake supplier')
    mock.sendFunAsrSentence(mock.asrConnections.length - 1, { sentenceId: 0, text: '说说你对 Java 的理解。', endMs: 1200 })
    await page.waitForFunction(id => window.__platformEvents.some(event => event.kind === 'transcript'
      && event.sessionId === id && event.segment.isFinal), sessionId)
    assert.equal(mock.asrConnections.at(-1).authorization, `Bearer ${keys.asr}`)
    await page.evaluate(() => window.copilot.stopAsr())
    await until(() => mock.asrConnections.at(-1).closed, 'Upstream ASR connection did not close')
  })

  await runAdminPlatformChecks({ baseUrl, password, keys, page, mock, knowledge, answer, until, check, noSecrets })

  await check('personal credentials take precedence without sending a platform Key to their endpoint', async () => {
    await page.evaluate(async baseUrl => {
      await window.copilot.saveCustomService({ name: '我的模型', kind: 'llm', url: baseUrl, model: 'mock-fast', apiKey: 'personal-test-key' })
    }, mock.llmBaseUrl)
    await answer('用自带模型回答。')
    assert.equal(mock.requests.at(-1).authorization, 'Bearer personal-test-key')
    await page.evaluate(async () => {
      const settings = await window.copilot.getSettings()
      const profile = settings.customServices.find(value => value.id === settings.serviceSelections.llm.id)
      await window.copilot.saveCustomService({ ...profile, hasApiKey: undefined, model: 'mock-error' })
    })
    const before = mock.requests.length
    await assert.rejects(page.evaluate(() => window.copilot.testModel()))
    assert.equal(mock.requests.length, before + 1)
    assert.equal(mock.requests.at(-1).authorization, 'Bearer personal-test-key')
  })

  await check('logout revokes the business token', async () => {
    await page.evaluate(() => window.copilot.startAsr())
    const active = mock.asrConnections.at(-1)
    await page.evaluate(() => window.copilot.platformLogout())
    await until(() => active.closed, 'Logout did not close the active platform ASR connection')
    const current = await page.evaluate(() => window.copilot.getSettings())
    assert.equal(current.platform.authenticated, false)
    assert.equal((await request(baseUrl, '/api/v1/auth/logout', {}, accessToken)).status, 204)
    assert.equal((await request(baseUrl, '/api/v1/platform', undefined, accessToken)).status, 401)
  })
  await check('logout returns to email login and existing verified email can sign in again', async () => {
    await expect(page.getByRole('heading', { name: '登录面试工作台' })).toBeVisible()
    await assert.rejects(page.evaluate(() => window.copilot.getHistory()), /注册或登录/)
    await page.screenshot({ path: join(output, 'email-login.png') })
    report.screenshots.push('email-login.png')
    await page.getByLabel('邮箱', { exact: true }).fill('desktop@example.test')
    await page.getByLabel('密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByRole('button', { name: '打开设置', exact: true })).toBeVisible()
    noSecrets(await page.evaluate(() => window.__platformEvents))
    await page.reload()
    await expect(page.getByRole('button', { name: '打开设置', exact: true })).toBeVisible()
  })
  await check('Web admin manages real users and configuration through its same-origin API proxy', async () => {
    const adminPort = await port()
    const adminUrl = `http://127.0.0.1:${adminPort}`
    adminServer = spawn(process.execPath, [join(repository, 'admin/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(adminPort), '--strictPort'], {
      cwd: join(repository, 'admin'), env: { ...process.env, COPILOT_ADMIN_PROXY_TARGET: baseUrl }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    adminServer.stdout.on('data', value => { logs = `${logs}${value}`.slice(-300000) })
    adminServer.stderr.on('data', value => { logs = `${logs}${value}`.slice(-300000) })
    await until(async () => {
      if (adminServer.exitCode !== null) throw new Error('Admin dev server exited')
      try { return (await fetch(adminUrl)).ok } catch { return false }
    }, 'Admin dev server did not become ready')
    // Each package owns its Playwright installation; a separate process avoids loading two test runtimes.
    const result = await execute(process.execPath, [join(repository, 'admin/scripts/smoke.mjs')], {
      cwd: join(repository, 'admin'), timeout: 180000,
      env: { ...process.env, COPILOT_ADMIN_URL: adminUrl, COPILOT_ADMIN_USERNAME: 'admin-test',
        COPILOT_ADMIN_PASSWORD: password, COPILOT_ADMIN_SMOKE_OUTPUT: join(repository, 'admin/test-results') },
    })
    process.stdout.write(result.stdout)
  })
  noSecrets(await page.evaluate(() => window.copilot.getSettings()))
} finally {
  await application?.close().catch(() => undefined)
  if (adminServer && adminServer.exitCode === null) {
    adminServer.kill('SIGTERM')
    await until(() => adminServer.exitCode !== null, 'Admin stop timeout', 5000).catch(() => adminServer.kill('SIGKILL'))
  }
  if (backend && backend.exitCode === null) {
    backend.kill('SIGTERM')
    await until(() => backend.exitCode !== null, 'Backend stop timeout', 10000).catch(() => backend.kill('SIGKILL'))
  }
  if (databaseStarted) await execute('docker', ['rm', '-f', container]).catch(() => undefined)
  await mock.close()
  await knowledge.close()
  await smtp.close()
  for (const secret of [...Object.values(keys), password]) logs = logs.replaceAll(secret, '[redacted]')
  await writeFile(join(output, 'platform-smoke-backend.log'), logs)
  await writeFile(join(output, 'platform-smoke-report.json'), JSON.stringify(report, null, 2))
  await rm(userData, { recursive: true, force: true })
}
