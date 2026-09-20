import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron } from 'playwright'
import { expect } from '@playwright/test'
import { loginForSmoke, mockAuthHandler } from './mock-auth.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'test-results')
const userData = await mkdtemp(join(tmpdir(), 'copilot-payment-smoke-'))
const auth = mockAuthHandler()
const packages = [
  { id: 1, version: 1, name: '轻量准备', description: '为一场重要的面试留好时间', durationSeconds: 3600, originalPriceCents: 1900, discountBps: 10000, priceCents: 1900, sortOrder: 1, enabled: true },
  { id: 2, version: 1, name: '从容应对', description: '多轮面试与日常练习，持续积累', durationSeconds: 10800, originalPriceCents: 5700, discountBps: 8000, priceCents: 4560, sortOrder: 2, enabled: true },
  { id: 3, version: 1, name: '充分准备', description: '覆盖完整面试周期，时长永久保留', durationSeconds: 36000, originalPriceCents: 19000, discountBps: 7500, priceCents: 14250, sortOrder: 3, enabled: true }
]
const orders = []
let available = false
const paidOrders = new Set()
const calls = []
const server = http.createServer(async (request, response) => {
  const reply = value => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
  calls.push({ method: request.method, path: request.url })
  if (request.url === '/api/v1/wallet') return reply({ availableSeconds: 3600 + orders.filter(order => order.credited).reduce((sum, order) => sum + order.durationSeconds, 0), version: paidOrders.size, serverTime: new Date().toISOString(), session: null })
  if (request.url === '/api/v1/packages') return reply({ paymentAvailable: available, paymentMethods: available ? ['wechat', 'alipay'] : [], packages })
  if (request.url === '/api/v1/payment-orders' && request.method === 'GET') return reply(orders)
  if (request.url === '/api/v1/payment-orders' && request.method === 'POST') {
    let raw = ''; for await (const chunk of request) raw += chunk
    const input = JSON.parse(raw)
    assert.deepEqual(Object.keys(input).sort(), ['packageId', 'packageVersion', 'paymentMethod', 'requestId'])
    const item = packages.find(item => item.id === input.packageId)
    assert.ok(['wechat', 'alipay'].includes(input.paymentMethod))
    const order = { id: `isolated-${input.paymentMethod}-order`, paymentMethod: input.paymentMethod, userId: 1, displayName: 'smoke-user', packageName: item.name,
      durationSeconds: item.durationSeconds, totalCents: item.priceCents, status: 'pending', credited: false,
      codeUrl: input.paymentMethod === 'wechat' ? 'weixin://wxpay/bizpayurl?pr=isolated-test-do-not-pay' : 'https://qr.alipay.com/isolated-test-do-not-pay', createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(), paidAt: null, refundedCents: 0, deductedSeconds: 0 }
    orders.push(order); return reply(order)
  }
  if (/^\/api\/v1\/payment-orders\/isolated-(wechat|alipay)-order\/refresh$/.test(request.url)) {
    const order = orders.find(order => request.url.includes(order.id))
    if (paidOrders.has(order.id)) Object.assign(order, { credited: true, status: 'paid', paidAt: new Date().toISOString() })
    return reply(order)
  }
  if (await auth(request, response)) return
  response.writeHead(404).end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`
let application
try {
  await mkdir(output, { recursive: true })
  const env = { ...process.env, COPILOT_USER_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE
  application = await _electron.launch({ executablePath: electronPath, args: ['.'], cwd: root, env })
  const page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  await application.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(window => window.isVisible()).setSize(1360, 960))
  await loginForSmoke(page, { llmBaseUrl: baseUrl })
  await page.getByRole('button', { name: '购买时长', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: '支付暂未开放' })).toBeVisible()
  await expect(page.getByRole('button', { name: '购买 轻量准备' })).toBeDisabled()
  await page.screenshot({ path: join(output, 'payment-unavailable.png'), animations: 'disabled' })
  available = true
  await page.getByRole('button', { name: '刷新套餐与订单' }).click()
  await expect(page.getByRole('button', { name: '购买 轻量准备' })).toBeEnabled()
  await page.screenshot({ path: join(output, 'payment-packages.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '购买 轻量准备' }).click()
  await expect(page.getByRole('img', { name: '使用手机微信扫描此二维码支付' })).toBeVisible()
  await page.screenshot({ path: join(output, 'payment-qr.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: join(output, 'payment-order-history.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '查看订单', exact: true }).click()
  await expect(page.getByRole('img', { name: '使用手机微信扫描此二维码支付' })).toBeVisible()
  await page.screenshot({ path: join(output, 'payment-resumed.png'), animations: 'disabled' })
  paidOrders.add('isolated-wechat-order')
  await page.getByRole('button', { name: '查看支付结果' }).click()
  await expect(page.getByRole('dialog').getByText('支付成功 · 时长已到账')).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(page.getByText('可用时长 02:00:00 · 购买时长长期有效，重复购买可累加。')).toBeVisible()
  await page.getByRole('button', { name: '支付宝支付', exact: true }).click()
  await page.getByRole('button', { name: '购买 从容应对' }).click()
  await expect(page.getByRole('dialog', { name: '支付宝扫码购买时长' })).toBeVisible()
  await expect(page.getByRole('img', { name: '使用手机支付宝扫描此二维码支付' })).toBeVisible()
  await page.screenshot({ path: join(output, 'payment-alipay-qr.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.getByRole('button', { name: '微信支付', exact: true }).click()
  await page.getByRole('listitem').filter({ hasText: '支付宝支付' }).getByRole('button', { name: '查看订单' }).click()
  await expect(page.getByRole('img', { name: '使用手机支付宝扫描此二维码支付' })).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.screenshot({ path: join(output, 'payment-both-methods-history.png'), animations: 'disabled' })
  assert.equal(orders[0].paymentMethod, 'wechat')
  assert.equal(orders[1].paymentMethod, 'alipay')
  assert.equal(calls.some(call => call.path.includes('/interview-sessions')), false)
  const report = { realPayments: false, realUserData: false, platform: 'loopback-only test double', checks: ['unconfigured disables purchase', 'enabled packages show', 'order request contains server-price identifiers only', 'QR renders', 'close preserves order', 'history resumes QR', 'confirmed credit refreshes wallet without starting interview', 'explicit Alipay method creates Alipay order', 'existing order preserves its method after selector changes'], screenshots: ['payment-unavailable.png', 'payment-packages.png', 'payment-qr.png', 'payment-order-history.png', 'payment-resumed.png', 'payment-alipay-qr.png', 'payment-both-methods-history.png'] }
  await writeFile(join(output, 'payment-smoke-report.json'), JSON.stringify(report, null, 2))
  process.stdout.write('PASS isolated payment smoke: 10 checks, 7 screenshots\n')
} finally {
  await application?.close()
  await new Promise(resolve => server.close(resolve))
  await rm(userData, { recursive: true, force: true })
}
