import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
const alipay = { version: 1, enabled: false, configured: false, appId: '', sellerId: '', gatewayUrl: 'https://openapi.alipay.com/gateway.do', notifyUrl: '', hasAppPrivateKey: false, hasAlipayPublicKey: false }
const wechat = { version: 0, enabled: false, configured: false, mchId: '', appId: '', merchantSerial: '', wechatPublicKeyId: '', notifyUrl: '', hasMerchantPrivateKey: false, hasApiV3Key: false, hasWechatPublicKey: false }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'mock-token', expiresAt: new Date(Date.now() + 3600000).toISOString() })))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const value = path.endsWith('/me') ? { id: 'mock-admin', displayName: '测试管理员', role: 'ADMIN' }
      : path.endsWith('/alipay') ? alipay : path.endsWith('/payment-config') ? wechat
        : { items: [], total: 0, page: 1, size: 20 }
    await route.fulfill({ json: value })
  })
  await page.goto(process.env.ADMIN_SMOKE_URL ?? 'http://127.0.0.1:4198')
  await page.getByRole('button', { name: '支付设置', exact: true }).click()
  await page.getByRole('button', { name: '支付宝支付', exact: true }).click()
  await expect(page.getByLabel('支付宝 AppID')).toBeVisible()
  await page.getByLabel('支付环境').selectOption('https://openapi-sandbox.dl.alipaydev.com/gateway.do')
  await expect(page.getByText(/沙箱环境仅用于测试/)).toBeVisible()
  await page.getByLabel('应用私钥（PKCS#8）').fill('synthetic-private-key')
  await page.getByRole('button', { name: '保存支付宝设置' }).click()
  await expect(page.getByText('支付宝设置已保存。')).toBeVisible()
  await expect(page.getByLabel('应用私钥（PKCS#8）')).toHaveValue('')
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/alipay-config.png', fullPage: true })
  expect(errors).toEqual([])
  console.log('PASS Alipay config selection, sandbox notice, mocked save and secret clear; no real API calls')
} finally { await browser.close() }
