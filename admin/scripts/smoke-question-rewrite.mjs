import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium, expect } from '@playwright/test'

// Production components/CSS, synthetic admin APIs only; no supplier or production calls.
const root = resolve('dist'), output = resolve('test-results/question-rewrite')
const preview = resolve('../assets/readme/question-rewrite.png')
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (!target.startsWith(`${root}/`)) { response.writeHead(404).end(); return }
  try {
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(target)] ?? 'application/octet-stream')
    response.end(await readFile(target))
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Cannot start isolated static server')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
let config = { version: 1, providers: [{ id: 'rewrite-provider', name: '快速问意整理', kind: 'llm', url: 'https://provider.example.invalid/v1/chat/completions', enabled: true, hasApiKey: true }], models: [{ id: 'rewrite-model', name: '快速改写模型', providerId: 'rewrite-provider', model: 'synthetic-fast-model', enabled: true, maxOutputTokens: 2048, thinkingMode: 'disabled', thinkingProtocol: 'bailian' }], defaultModelId: 'rewrite-model', screenshotModelId: '', asr: { enabled: false, providerId: '', model: '' }, embedding: { enabled: false, providerId: '', model: '', dimensions: 1024 } }
const originalQuestion = '那个，Redis 多实例的任务啊，同一个任务点了两次，怎么避免重复执行？先不讨论跨地域。'
const rewrittenQuestion = 'Redis 多实例任务场景下，如何避免同一任务重复执行？本次不讨论跨地域。'
const sample = { originalQuestion, status: 'rewritten', question: rewrittenQuestion, model: 'synthetic-fast-model' }
const writes = [], tests = [], errors = [], unhandled = []
let failTest = false, conflictSave = false
const policy = () => page.getByRole('form', { name: '问题改写策略', exact: true })
const modelCard = () => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: '快速改写模型', exact: true }) })
async function chooseModel() {
  await policy().getByRole('combobox', { name: '问题改写模型', exact: true }).click()
  await page.getByRole('option', { name: '快速改写模型', exact: true }).click()
}
async function appearance(theme, density) {
  await page.getByRole('button', { name: '外观设置', exact: true }).click()
  await page.getByRole('radio', { name: theme, exact: true }).click()
  if (density) await page.getByRole('radio', { name: density, exact: true }).click()
  await page.getByRole('button', { name: '完成', exact: true }).click()
}
async function screenshot(name) { await page.screenshot({ path: resolve(output, name) }) }
page.on('pageerror', error => errors.push(error.message))
try {
  await mkdir(output, { recursive: true }); await mkdir(resolve('../assets/readme'), { recursive: true })
  await page.addInitScript(() => {
    sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'synthetic-preview-token', expiresAt: '2099-01-01T00:00:00Z' }))
    localStorage.setItem('rewick.admin.appearance', JSON.stringify({ theme: 'light', density: 'regular', railCollapsed: false, motion: false }))
  })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') await route.continue()
    else { unhandled.push(route.request().url()); await route.abort() }
  })
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let body
    if (path.endsWith('/admin/me')) body = { id: 'synthetic-admin', displayName: '演示管理员', role: 'ADMIN' }
    else if (path.endsWith('/admin/users')) body = { items: [], total: 0, page: 1, size: 20 }
    else if (path.endsWith('/admin/config/test')) {
      tests.push(request.postDataJSON())
      body = failTest ? { success: false, message: '合成样例：改写服务超时，请检查模型与超时设置。', latencyMs: 1500 } : { success: true, message: '问题改写测试通过。', latencyMs: 168, questionRewrite: sample }
    } else if (path.endsWith('/admin/config')) {
      if (request.method() === 'PUT') {
        const value = request.postDataJSON(); writes.push(value)
        if (conflictSave) { await route.fulfill({ status: 409, json: { message: '合成样例：配置版本冲突。' } }); return }
        config = { ...value, version: config.version + 1, providers: value.providers.map(({ apiKey: _key, ...provider }) => ({ ...provider, hasApiKey: true })) }
      }
      body = config
    } else { unhandled.push(path); await route.fulfill({ status: 500, json: { message: 'Unexpected synthetic API' } }); return }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.getByRole('button', { name: '模型与服务', exact: true }).click()
  await expect(policy().getByRole('switch', { name: '启用问题改写', exact: true })).not.toBeChecked()
  await expect(policy().getByLabel('问题改写超时（毫秒）', { exact: true })).toHaveValue('1500')
  await chooseModel()
  await policy().getByRole('button', { name: '测试问题改写', exact: true }).click()
  await expect(policy().getByText(rewrittenQuestion, { exact: true })).toBeVisible()
  expect(tests[0]).toMatchObject({ capability: 'question-rewrite', config: { questionRewrite: { enabled: false, modelId: 'rewrite-model', timeoutMs: 1500 } } })
  expect(writes).toHaveLength(0)
  await expect(policy().getByText(/实际模型：synthetic-fast-model/)).toContainText('168 ms')
  failTest = true
  await policy().getByLabel('问题改写超时（毫秒）', { exact: true }).fill('2000')
  await expect(policy().getByRole('region', { name: '改写测试结果', exact: true })).toHaveCount(0)
  await policy().getByRole('button', { name: '测试问题改写', exact: true }).click()
  await expect(policy().getByRole('alert')).toContainText('改写服务超时')
  await expect(policy().getByLabel('问题改写超时（毫秒）', { exact: true })).toHaveValue('2000')
  expect(writes).toHaveLength(0)
  await screenshot('failed-test-light.png')
  failTest = false; conflictSave = true
  await policy().getByText('启用问题改写', { exact: true }).click()
  await policy().getByRole('button', { name: '保存问题改写配置', exact: true }).click()
  await expect(policy().getByText(/配置已被其他管理员修改/)).toBeVisible()
  await expect(policy().getByRole('button', { name: '测试问题改写', exact: true })).toBeDisabled()
  await expect(policy().getByRole('combobox', { name: '问题改写模型', exact: true })).toContainText('快速改写模型')
  await screenshot('conflict-light.png')
  conflictSave = false
  await page.getByRole('button', { name: '重新加载配置', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(policy().getByRole('switch', { name: '启用问题改写', exact: true })).not.toBeChecked()
  await expect(policy().getByRole('combobox', { name: '问题改写模型', exact: true })).toContainText('暂不选择改写模型')
  await chooseModel()
  await policy().getByLabel('问题改写超时（毫秒）', { exact: true }).fill('2000')
  await policy().getByText('启用问题改写', { exact: true }).click()
  await policy().getByRole('button', { name: '保存问题改写配置', exact: true }).click()
  await expect.poll(() => config.questionRewrite?.enabled).toBe(true)
  expect(writes.at(-1)).toMatchObject({ version: 1, questionRewrite: { enabled: true, modelId: 'rewrite-model', timeoutMs: 2000 } })
  const published = writes.length
  await modelCard().getByRole('button', { name: '停用', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('问题改写引用')
  expect(writes).toHaveLength(published)
  await policy().getByRole('button', { name: '测试问题改写', exact: true }).click()
  await expect(policy().getByText(rewrittenQuestion, { exact: true })).toBeVisible()
  expect(writes).toHaveLength(published)
  await expect(page.locator('.rail-brand img.brand-mark')).toHaveAttribute('src', '/rewick-icon.png')
  expect(await page.locator('.rail-brand img.brand-mark').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
  await policy().evaluate(element => element.closest('section.panel').scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: preview })
  await appearance('深色', '紧凑')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await policy().scrollIntoViewIfNeeded(); await screenshot('dark-compact.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await policy().getByRole('combobox', { name: '问题改写模型', exact: true }).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await screenshot('mobile-dark.png')
  await appearance('浅色', '标准')
  await policy().getByText('启用问题改写', { exact: true }).click()
  await policy().getByRole('button', { name: '保存问题改写配置', exact: true }).click()
  await expect.poll(() => config.questionRewrite?.enabled).toBe(false)
  expect(config.questionRewrite).toMatchObject({ modelId: 'rewrite-model', timeoutMs: 2000 })
  await expect(policy().getByRole('combobox', { name: '问题改写模型', exact: true })).toContainText('快速改写模型')
  await policy().scrollIntoViewIfNeeded(); await screenshot('mobile-light-disabled.png')
  expect(errors).toEqual([]); expect(unhandled).toEqual([])
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: ['旧配置缺省关闭', '关闭保留模型与超时', '草稿测试不发布且使用后端真实响应结构', '测试显示原文/结果/实际模型/外层耗时', '失败保留草稿', '版本冲突阻止后续写入并支持重载', '活动绑定禁止停用', '390px无横向溢出', '浅色/深色及密度', '原品牌图标'], preview, writes: writes.length, tests: tests.length, pageErrors: errors, unhandled, data: 'isolated synthetic responses only' }, null, 2))
  process.stdout.write(`PASS isolated question rewrite UI; README screenshot: ${preview}\n`)
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }); throw error
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
