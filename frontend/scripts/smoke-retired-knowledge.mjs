import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import electron from 'electron'

const root = fileURLToPath(new URL('..', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'copilot-retired-knowledge-'))
const output = join(root, 'test-results')
const now = new Date().toISOString()
const documentId = '22222222-2222-4222-8222-222222222222'
const environment = { id: '11111111-1111-4111-8111-111111111111', name: '资料与联网测试', interviewType: 'technical', resumeId: 'resume', targetId: null, referenceIds: [documentId], createdAt: now, updatedAt: now }
const user = { id: 'retired-knowledge-smoke', displayName: '隔离测试', email: 'isolated@example.test' }
const info = { user, advancedSettingsEnabled: true, webSearchAvailable: true, capabilities: { llm: true, asr: false }, models: { llm: 'model', asr: '', available: [{ id: 'model', name: '本地模拟模型' }] }, services: { asr: [] }, limits: { maxAsrSessionSeconds: 3600 } }
let preferences = { version: 0, unavailableSelections: [], preferences: { answerStyle: 'concise', temperature: .5, silenceMs: 800, autoAnswer: { enabled: false, pauseMs: 1500 }, retrievalEnabled: false, webSearchEnabled: true, platformSelections: { llm: 'model', asr: null } } }
let wallet = { availableSeconds: 3600, version: 1, serverTime: now, session: null }
const requests = [], modelInputs = [], searches = []
let hold = false, pending = [], cancelled = 0
const checks = []
const localExcerpt = { source: 'platform', documentId, chunkId: 'local-1', revision: 1, name: '合成资料.md', kind: 'technical', text: '合成资料：更新数据库后删除缓存。' }
const webExcerpt = { source: 'web', documentId: 'web:1', chunkId: 'web:1', revision: 1, name: '合成网页', title: '合成网页', kind: 'technical', text: '合成网页：失败删除应异步重试。', url: 'https://example.test/cache' }
const server = createServer(async (request, response) => {
  const path = request.url.split('?')[0]
  requests.push(path)
  let body
  if (request.method === 'POST') { let raw = ''; for await (const chunk of request) raw += chunk; body = raw ? JSON.parse(raw) : {} }
  let data
  if (path === '/api/v1/auth/login') data = { user, accessToken: 'isolated-test-token', expiresAt: new Date(Date.now() + 3600000).toISOString() }
  else if (path === '/api/v1/auth/session') { response.writeHead(204); response.end(); return }
  else if (path === '/api/v1/platform') data = info
  else if (path === '/api/v1/user-preferences') {
    if (body) preferences = { ...preferences, version: preferences.version + 1, preferences: body.preferences }
    data = preferences
  } else if (path === '/api/v1/background') data = { resumes: [{ id: 'resume', name: '合成简历', text: '合成测试工程师', createdAt: now, updatedAt: now }], targets: [], environments: [environment], activeEnvironmentId: environment.id }
  else if (path === `/api/v1/background/environments/${environment.id}`) data = { ...environment, version: 1 }
  else if (path === '/api/v1/background/resumes/resume') data = { id: 'resume', name: '合成简历', text: '合成测试工程师' }
  else if (path.endsWith('/activate')) data = {}
  else if (path === '/api/v1/references') data = [{ id: documentId, name: '合成资料.md', kind: 'technical', enabled: true, status: 'ready', contextCount: 1, sectionCount: 1, format: 'md', headingMode: 'heading', splitterVersion: 2, indexStatus: 'ready', indexError: '', contentHash: 'synthetic', revision: 1, createdAt: now, updatedAt: now, chunkCount: 1 }]
  else if (path === '/api/v1/invitations/settings') data = { enabled: false, version: 0, rewardSeconds: 0 }
  else if (path.startsWith('/api/v1/session-records/') && body) data = { version: 1, record: body.record }
  else if (path === '/api/v1/session-records') data = { records: [], nextCursor: null }
  else if (path === '/api/v1/mock-interviews/availability') data = { enabled: false, availableSeconds: 0 }
  else if (path === '/api/v1/interview-sessions/start') {
    wallet = { ...wallet, session: { id: 'session', status: 'active', startedAt: now, expiresAt: new Date(Date.now() + 3600000).toISOString(), endedAt: null, usedSeconds: 0, endReason: null }, background: { context: { name: '合成简历', text: '合成测试工程师' }, interviewTarget: { companyName: '', roleName: '', jobDescription: '' }, interviewEnvironment: { ...environment, resumeName: '合成简历', targetName: '' } } }
    data = wallet
  } else if (path.endsWith('/end')) { wallet = { ...wallet, session: { ...wallet.session, status: 'ended', endedAt: new Date().toISOString(), endReason: 'user' } }; data = wallet }
  else if (path === '/api/v1/wallet' || path.endsWith('/heartbeat')) data = wallet
  else if (path === '/api/v1/references/search' || path === '/api/v1/web-search') {
    const branch = path.includes('/references/') ? 'local' : 'web'
    searches.push({ branch, body })
    const respond = () => {
      if (response.destroyed) return
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ status: 'ready', excerpts: [branch === 'local' ? localExcerpt : webExcerpt] }))
    }
    if (hold) { response.on('close', () => { cancelled++ }); return }
    if (preferences.preferences.retrievalEnabled) {
      pending.push(respond)
      // A barrier proves both branches begin before either response completes.
      if (pending.length === 2) { const ready = pending; pending = []; ready.forEach(done => done()) }
      return
    }
    respond(); return
  } else if (path.startsWith('/api/v1/references/search/') && request.method === 'DELETE') { response.writeHead(204); response.end(); return }
  else if (path === '/api/v1/llm/chat/completions') {
    modelInputs.push(body)
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '合成回答：先更新数据库，再删除缓存，失败时重试。' } }] })}\n\ndata: [DONE]\n\n`); return
  } else { response.writeHead(404); response.end('{}'); return }
  response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let app
try {
  await mkdir(output, { recursive: true })
  const env = { ...process.env, COPILOT_USER_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ executablePath: electron, args: ['.'], cwd: root, env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  await page.waitForFunction(() => Boolean(window.copilot))
  await page.evaluate(async baseUrl => {
    const settings = await window.copilot.getSettings()
    await window.copilot.saveSettings({ ...settings, platform: { enabled: true, baseUrl } })
    await window.copilot.platformLogin({ identifier: 'isolated@example.test', password: 'isolated-test-password' })
    window.__retrievalEvents = []
    window.copilot.onEvent(event => window.__retrievalEvents.push(event))
  }, `http://127.0.0.1:${server.address().port}`)
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '模型与设置' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /^回答模型/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /^实时语音转写/ })).toBeVisible()
  await expect(page.getByText('远程知识库', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('启用远程知识库')).toHaveCount(0)
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '模型与设置' })).toHaveCount(0)
  assert.equal(await page.evaluate(() => 'testRemoteKnowledge' in window.copilot), false)
  const saved = await page.evaluate(async asrUrl => {
    await window.copilot.saveCustomService({ kind: 'asr', name: '合成转写', url: asrUrl, model: 'synthetic', apiKey: 'synthetic-asr-key' })
    const own = await window.copilot.saveCustomService({ kind: 'llm', name: '合成回答', url: new URL('/api/v1/llm', asrUrl.replace(/^ws/, 'http')).href, model: 'synthetic-model', apiKey: 'synthetic-llm-key' })
    return window.copilot.saveSettings({ ...own, autoAnswer: { enabled: false, pauseMs: 1500 } })
  }, `ws://127.0.0.1:${server.address().port}/synthetic-asr`)
  assert.equal('remoteKnowledge' in saved, false)
  assert.equal(saved.asr.hasApiKey, true)
  assert.equal(saved.llm.hasApiKey, true)
  assert.equal(saved.serviceSelections.llm.source, 'custom')
  checks.push('real login, settings UI/save, ASR custom configuration, removed remote IPC and fields')
  await page.getByRole('button', { name: '开始面试', exact: true }).click()
  await expect(page.getByRole('button', { name: '结束面试', exact: true })).toBeVisible()
  const generate = async id => page.evaluate(async id => window.copilot.generateAnswer({ requestId: id, question: '如何保持缓存一致性？', transcript: '' }), id)
  await generate('web-only')
  await expect.poll(() => modelInputs.length).toBe(1)
  assert.deepEqual(searches.map(search => search.branch), ['web'])
  checks.push('disabled reference switch does not query platform documents; web search still runs')
  await page.evaluate(async environmentId => { await window.copilot.endInterview(); const settings = await window.copilot.getSettings(); await window.copilot.saveSettings({ ...settings, retrieval: { enabled: true } }); await window.copilot.startInterview(crypto.randomUUID(), environmentId) }, environment.id)
  await generate('hybrid-and-web')
  await expect.poll(() => modelInputs.length).toBe(2)
  assert.deepEqual(searches.slice(-2).map(search => search.branch).sort(), ['local', 'web'])
  assert.deepEqual(searches.find(search => search.branch === 'local').body.referenceIds, [documentId])
  const context = JSON.parse(modelInputs[1].messages[1].content).referenceContext
  assert.deepEqual(context.map(excerpt => excerpt.source), ['platform', 'web'])
  assert.ok(context[0].text.includes('合成资料'))
  assert.ok(context[1].text.includes('合成网页'))
  checks.push('current environment documents and web run concurrently, with both sources sent to model')
  hold = true
  const pendingGenerate = generate('cancelled')
  await expect.poll(() => searches.length).toBe(5)
  await page.evaluate(() => window.copilot.cancelAnswer())
  await pendingGenerate
  await expect.poll(() => cancelled).toBeGreaterThanOrEqual(2)
  assert.equal(modelInputs.length, 2)
  checks.push('cancellation aborts both held retrieval branches and prevents a model call')
  const retiredError = await page.evaluate(async () => {
    try {
      await window.copilot.saveSession({ id: 'rejected-history', title: '不允许的旧来源', createdAt: new Date().toISOString(), segments: [], answers: [{ id: 'answer', question: '合成问题', text: '应保留的问答正文', createdAt: new Date().toISOString(), status: 'complete', retrieval: { status: 'ready', excerpts: [{ source: 'bailian', documentId: 'retired', chunkId: 'retired', revision: 1, name: 'retired', kind: 'technical', text: 'retired' }] } }] })
      return ''
    } catch (error) { return error.message }
  })
  assert.match(retiredError, /retrieval.excerpts.0.source/)
  checks.push('removed historical source is rejected by real history IPC validation')
  assert.equal(requests.some(path => path.includes('/knowledge/')), false)
  await page.screenshot({ path: join(output, 'retired-knowledge-ui.png') })
  await writeFile(join(output, 'retired-knowledge-report.json'), JSON.stringify({ version: await app.evaluate(({ app }) => app.getVersion()), liveSuppliers: false, isolatedProfile: true, checks }, null, 2))
  for (const check of checks) console.info(`PASS ${check}`)
} finally {
  await app?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
