import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'synthetic-token', expiresAt: new Date(Date.now() + 3600000).toISOString() })))
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') throw new Error('Unexpected mutation in draft-only test')
    const path = new URL(route.request().url()).pathname
    const value = path.endsWith('/me') ? { id: 'synthetic-admin', username: 'synthetic-admin', role: 'ADMIN' }
      : path.endsWith('/config') ? { version: 0, providers: [], models: [], defaultModelId: '', asr: { enabled: false, providerId: '', model: '' }, knowledge: { enabled: false, providerId: '', agentId: '' } }
        : { items: [], total: 0, page: 1, size: 20 }
    await route.fulfill({ json: value })
  })
  await page.goto('http://101.33.245.166:8080')
  await page.getByRole('button', { name: '平台配置', exact: true }).click()
  await expect(page.getByText('尚无模型或服务，请添加。')).toBeVisible()
  console.log(await page.evaluate(() => ({ secureContext: isSecureContext, randomUUID: typeof crypto.randomUUID, getRandomValues: typeof crypto.getRandomValues })))
  for (const name of ['添加回答模型', '添加语音转写', '添加远程知识库']) await page.getByRole('button', { name, exact: true }).click()
  if (process.argv.includes('--reproduce')) {
    console.log({ errors, forms: await page.getByRole('form').count() })
    if (!errors.some(value => value.includes('randomUUID'))) throw new Error('Expected pre-fix HTTP error was not reproduced')
  } else {
    await expect(page.getByRole('form')).toHaveCount(3)
    expect(errors).toEqual([])
    console.log('PASS public HTTP add model, ASR, knowledge drafts; all APIs mocked, no server config changed')
  }
} finally { await browser.close() }
