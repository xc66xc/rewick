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
const info = { user, advancedSettingsEnabled: true, capabilities: { llm: true, asr: false, }, models: { llm: 'model', asr: '', available: [{ id: 'model', name: '模拟回答模型' }] }, services: { asr: [], }, limits: { maxAsrSessionSeconds: 3600 } }
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
  else if (path === '/api/v1/user-preferences') data = { version: 0, unavailableSelections: [], preferences: { answerStyle: 'concise', temperature: 0.5, silenceMs: 800, autoAnswer: { enabled: true, pauseMs: 1500 }, retrievalEnabled: false, platformSelections: { llm: 'model', asr: null, } } }
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
  await expect(page.getByRole('button', { name: '透明与共享设置' })).toBeVisible()
  await page.getByRole('textbox', { name: '当前问题', exact: true }).fill('你是怎么解决缓存与数据库的一致性问题的？')
  await page.getByRole('button', { name: '发送问题', exact: false }).click()
  await expect(page.getByText('已完成', { exact: true })).toBeAttached()
  await expect(page.getByRole('textbox', { name: '当前问题', exact: true })).toHaveValue('')
  const questionBubble = await page.locator('.compact-answer__question-bubble').boundingBox()
  const answerBubble = await page.locator('.compact-answer__reply').boundingBox()
  assert.ok(questionBubble.x > answerBubble.x, 'Question should be right-aligned relative to the answer')
  assert.equal(await page.locator('.compact-answer__body').evaluate(node => getComputedStyle(node).fontSize), '19px')
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgba(0, 0, 0, 0)')
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.compact-surface')).backgroundColor), 'rgba(255, 255, 255, 0.2)')
  await mkdir(join(root, 'test-results'), { recursive: true })
  await page.getByRole('region', { name: '回答与面试信息' }).focus()
  await page.screenshot({ path: join(root, 'test-results/compact-transparent.png'), omitBackground: true })
  // Preview-only backdrop for inspecting dark ink; verify native transparency above.
  const backdrop = await page.addStyleTag({ content: 'html.compact-transparent { background: #f4f5f3; }' })
  await page.screenshot({ path: join(root, 'test-results/compact-readable-preview.png') })
  await backdrop.evaluate(element => element.remove())
  await page.getByRole('button', { name: '透明与共享设置' }).click()
  const slider = page.getByRole('slider', { name: '背景不透明度' })
  const bounds = await slider.boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 4, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(slider).toHaveValue('40')
  assert.equal(await page.locator('.compact-surface').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(255, 255, 255, 0.4)')
  assert.equal(await page.evaluate(async () => {
    const settings = await window.copilot.getSettings()
    return (await window.copilot.withAccountScope(settings.accountScope).getWindowPreferences()).backgroundOpacity
  }), 20)
  await page.mouse.up()
  await expect(slider).toBeEnabled()
  await slider.press('ArrowRight')
  await expect(slider).toHaveValue('41')
  await expect(slider).toBeEnabled()
  await page.screenshot({ path: join(root, 'test-results/compact-opacity-slider.png') })
  await slider.press('Home')
  await expect(slider).toHaveValue('0')
  await expect(slider).toBeEnabled()
  await page.getByRole('switch', { name: '共享保护' }).click()
  await expect(page.getByRole('switch', { name: '共享保护' })).not.toBeChecked()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('button', { name: '透明与共享设置' })).toHaveAttribute('title', /共享保护未开启/)
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
