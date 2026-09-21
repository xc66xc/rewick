import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import electron from 'electron'

const root = fileURLToPath(new URL('..', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'copilot-protection-'))
const now = new Date().toISOString()
const user = { id: 'compact-smoke', displayName: '窗口测试', email: 'compact@example.test' }
const environment = { id: '11111111-1111-4111-8111-111111111111', name: '技术面试', interviewType: 'technical', resumeId: 'resume', targetId: null, referenceIds: [], createdAt: now, updatedAt: now }
const info = { user, advancedSettingsEnabled: true, capabilities: { llm: true, asr: false, knowledge: false }, models: { llm: 'model', asr: '', available: [{ id: 'model', name: '模拟回答模型' }] }, services: { asr: [], knowledge: [] }, limits: { maxAsrSessionSeconds: 3600 } }
let settled = 0
let wallet = { availableSeconds: 3600, version: 1, serverTime: now, session: null }
const server = createServer(async (request, response) => {
  const path = request.url.split('?')[0]
  let data
  if (path === '/api/v1/llm/chat/completions') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '我在项目里采用的是**先更新数据库，再删除缓存**。这样实现比较简单，也更容易定位问题。\n\n真正需要处理的是删除缓存失败的情况。我会通过**消息队列重试**，并给缓存设置合理的过期时间，避免旧数据一直存在。\n\n如果业务对一致性要求更高，我会结合订阅数据库变更来更新缓存。具体方案还是要看业务能接受多长时间的数据延迟。' } }] }) + '\n\ndata: [DONE]\n\n')
    return
  }
  if (path === '/api/v1/auth/login') data = { user, accessToken: 'isolated-test-token', expiresAt: new Date(Date.now() + 3600000).toISOString() }
  else if (path === '/api/v1/auth/session') { response.writeHead(204); response.end(); return }
  else if (path === '/api/v1/platform') data = info
  else if (path === '/api/v1/user-preferences') data = { version: 0, unavailableSelections: [], preferences: { answerStyle: 'concise', temperature: 0.5, silenceMs: 800, autoAnswer: { enabled: true, pauseMs: 1500 }, retrievalEnabled: false, remoteKnowledgeEnabled: false, platformSelections: { llm: 'model', asr: null, knowledge: null } } }
  else if (path === '/api/v1/background') data = { resumes: [{ id: 'resume', name: '测试简历', text: '测试开发工程师', createdAt: now, updatedAt: now }], targets: [], environments: [environment], activeEnvironmentId: '11111111-1111-4111-8111-111111111111' }
  else if (path === '/api/v1/background/environments/11111111-1111-4111-8111-111111111111') data = { ...environment, version: 1 }
  else if (path === '/api/v1/background/resumes/resume') data = { id: 'resume', name: '测试简历', text: '测试开发工程师' }
  else if (path === '/api/v1/background/environments/11111111-1111-4111-8111-111111111111/activate') data = {}
  else if (path === '/api/v1/references') data = []
  else if (path === '/api/v1/invitations/settings') data = { enabled: false, version: 0, rewardSeconds: 0 }
  else if (path.startsWith('/api/v1/session-records/') && request.method === 'POST') { let raw = ''; for await (const chunk of request) raw += chunk; const body = JSON.parse(raw); data = { version: 1, record: body.record } }
  else if (path === '/api/v1/session-records') data = { records: [], nextCursor: null }
  else if (path === '/api/v1/interview-sessions/start') {
    wallet = { ...wallet, session: { id: 'session', status: 'active', startedAt: now, expiresAt: new Date(Date.now() + 3600000).toISOString(), endedAt: null, usedSeconds: 0, endReason: null }, background: { context: { name: '测试简历', text: '测试开发工程师' }, interviewTarget: { companyName: '', roleName: '', jobDescription: '' }, interviewEnvironment: { ...environment, resumeName: '测试简历', targetName: '' } } }
    data = wallet
  } else if (path.endsWith('/end')) { settled++; await new Promise(resolve => setTimeout(resolve, 300)); wallet = { ...wallet, session: { ...wallet.session, status: 'ended', endedAt: new Date().toISOString(), endReason: 'user' } }; data = wallet }
  else if (path === '/api/v1/wallet' || path.endsWith('/heartbeat')) data = wallet
  else { console.log('Unhandled test endpoint:', path); response.writeHead(404); response.end('{}'); return }
  response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let app
try {
  const env = { ...process.env, COPILOT_USER_DATA: directory }
  delete env.ELECTRON_RUN_AS_NODE
  app = await _electron.launch({ executablePath: electron, args: ['.'], cwd: root, env })
  const page = await app.firstWindow()
  await page.waitForFunction(() => Boolean(window.copilot))
  await page.evaluate(async baseUrl => {
    const settings = await window.copilot.getSettings()
    await window.copilot.saveSettings({ ...settings, platform: { enabled: true, baseUrl } })
    await window.copilot.platformLogin({ identifier: 'compact@example.test', password: 'isolated-test-password' })
  }, `http://127.0.0.1:${server.address().port}`)
  const protectedWindows = () => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().map(window => window.isContentProtected()))
  assert.deepEqual(await protectedWindows(), [true])
  await page.getByRole('button', { name: '打开设置' }).click()
  const protection = page.getByRole('switch', { name: '共享保护', exact: true })
  await expect(protection).toBeChecked()
  await protection.click()
  await expect(protection).not.toBeChecked()
  await expect(protection).toBeEnabled()
  assert.deepEqual(await protectedWindows(), [false])
  await page.getByRole('button', { name: '关闭', exact: true }).first().click()
  await page.getByRole('button', { name: '开始面试', exact: true }).click()
  await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
  await page.getByRole('button', { name: '透明与共享设置' }).click()
  await expect(protection).not.toBeChecked()
  await protection.click()
  await expect(protection).toBeChecked()
  await expect(protection).toBeEnabled()
  assert.deepEqual(await protectedWindows(), [true, true])
  await page.getByRole('button', { name: '关闭', exact: true }).first().click()
  await page.getByRole('button', { name: '结束面试', exact: true }).click()
  await expect(page.getByRole('heading', { name: '准备面试' })).toBeVisible()
  assert.deepEqual(await protectedWindows(), [true, true])
  await page.getByRole('button', { name: '打开设置' }).click()
  await expect(protection).toBeChecked()
  await protection.click()
  await expect(protection).not.toBeChecked()
  await expect(protection).toBeEnabled()
  await app.close()
  app = await _electron.launch({ executablePath: electron, args: ['.'], cwd: root, env })
  await app.firstWindow()
  assert.deepEqual(await protectedWindows(), [false])
  console.log('PASS: normal/compact controls synchronized, native hosts updated immediately, protection survives interview end and restart')
} finally {
  await app?.close()
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
