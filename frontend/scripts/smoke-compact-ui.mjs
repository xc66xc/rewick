import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import electron from 'electron'

const root = fileURLToPath(new URL('..', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'copilot-compact-ui-'))
const now = new Date().toISOString()
const user = { id: 'compact-smoke', displayName: '窗口测试', email: 'compact@example.test' }
const environment = { id: '11111111-1111-4111-8111-111111111111', name: '技术面试', interviewType: 'technical', resumeId: 'resume', targetId: null, referenceIds: [], createdAt: now, updatedAt: now }
const info = { user, capabilities: { llm: false, asr: false, knowledge: false }, models: { llm: '', asr: '' }, services: { asr: [], knowledge: [] }, limits: { maxAsrSessionSeconds: 3600 } }
let wallet = { availableSeconds: 3600, version: 1, serverTime: now, session: null }
const server = createServer(async (request, response) => {
  const path = request.url.split('?')[0]
  let data
  if (path === '/api/v1/auth/login') data = { user, accessToken: 'isolated-test-token', expiresAt: new Date(Date.now() + 3600000).toISOString() }
  else if (path === '/api/v1/auth/session') { response.writeHead(204); response.end(); return }
  else if (path === '/api/v1/platform') data = info
  else if (path === '/api/v1/user-preferences') data = { version: 0, unavailableSelections: [], preferences: { answerStyle: 'concise', temperature: 0.5, silenceMs: 800, autoAnswer: { enabled: true, pauseMs: 1500 }, retrievalEnabled: false, remoteKnowledgeEnabled: false, platformSelections: { llm: null, asr: null, knowledge: null } } }
  else if (path === '/api/v1/background') data = { resumes: [{ id: 'resume', name: '测试简历', text: '测试开发工程师', createdAt: now, updatedAt: now }], targets: [], environments: [environment], activeEnvironmentId: '11111111-1111-4111-8111-111111111111' }
  else if (path === '/api/v1/background/environments/11111111-1111-4111-8111-111111111111') data = { ...environment, version: 1 }
  else if (path === '/api/v1/background/resumes/resume') data = { id: 'resume', name: '测试简历', text: '测试开发工程师' }
  else if (path === '/api/v1/background/environments/11111111-1111-4111-8111-111111111111/activate') data = {}
  else if (path === '/api/v1/references') data = []
  else if (path === '/api/v1/invitations/settings') data = { enabled: false, version: 0, rewardSeconds: 0 }
  else if (path === '/api/v1/session-records') data = { records: [], nextCursor: null }
  else if (path === '/api/v1/interview-sessions/start') {
    wallet = { ...wallet, session: { id: 'session', status: 'active', startedAt: now, expiresAt: new Date(Date.now() + 3600000).toISOString(), endedAt: null, usedSeconds: 0, endReason: null }, background: { context: { name: '测试简历', text: '测试开发工程师' }, interviewTarget: { companyName: '', roleName: '', jobDescription: '' }, interviewEnvironment: { ...environment, resumeName: '测试简历', targetName: '' } } }
    data = wallet
  } else if (path.endsWith('/end')) { wallet = { ...wallet, session: { ...wallet.session, status: 'ended', endedAt: new Date().toISOString(), endReason: 'user' } }; data = wallet }
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
  await page.getByRole('button', { name: '开始面试', exact: true }).click()
  await expect(page.getByRole('button', { name: '结束面试', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
  await expect(page.getByText('共享保护已开启（尽力保护）')).toBeVisible()
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgba(0, 0, 0, 0)')
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.compact-surface')).backgroundColor), 'rgba(255, 255, 255, 0.35)')
  await mkdir(join(root, 'test-results'), { recursive: true })
  await page.screenshot({ path: join(root, 'test-results/compact-transparent.png'), omitBackground: true })
  await page.getByRole('button', { name: '透明与共享设置' }).click()
  await page.getByRole('combobox', { name: '背景不透明度' }).click()
  await page.getByRole('option', { name: '0% · 完全透明' }).click()
  await page.getByRole('switch', { name: '共享保护' }).click()
  await expect(page.getByRole('switch', { name: '共享保护' })).not.toBeChecked()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByText('共享保护未开启')).toBeVisible()
  assert.deepEqual(await page.evaluate(async () => {
    const settings = await window.copilot.getSettings()
    return window.copilot.withAccountScope(settings.accountScope).getWindowPreferences()
  }), { backgroundOpacity: 0, contentProtection: false })
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(window => window.isVisible()).close())
  await expect(page.getByRole('button', { name: '紧凑模式', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '紧凑模式', exact: true }).click()
  await page.getByRole('button', { name: '结束面试', exact: true }).click()
  await expect(page.getByRole('heading', { name: '准备面试' })).toBeVisible()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('compact-transparent')), false)
  console.log('PASS: real app IPC, transparency, preferences, native close and interview end')
} finally {
  await app?.close()
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
