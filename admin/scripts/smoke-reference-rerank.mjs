import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium, expect } from '@playwright/test'

// All configuration, auth and test requests use synthetic browser responses.
const root = resolve('dist')
const output = resolve('test-results/reference-rerank')
const preview = resolve('../assets/readme/reference-rerank.png')
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (!target.startsWith(`${root}/`)) { response.writeHead(404).end(); return }
  try {
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(target)] ?? 'application/octet-stream')
    response.end(await readFile(target))
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Cannot start isolated static server')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 }, reducedMotion: 'reduce' })
let config = { version: 1, providers: [{ id: 'rerank-preview', name: '百炼资料重排序', kind: 'rerank', url: 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank', enabled: true, hasApiKey: true }], models: [], defaultModelId: '', asr: { enabled: false, providerId: '', model: '' }, embedding: { enabled: false, providerId: '', model: '', dimensions: 1024 }, rerank: { enabled: true, providerId: 'rerank-preview', model: 'qwen3-rerank', timeoutMs: 1500 } }
let policy = { maxFiles: 20, maxTotalBytes: 104857600, maxChunks: 10000, childTarget: 600, childOverlap: 100, parentTarget: 1400, bm25K1: 1.2, bm25B: .75, vectorMinScore: .55, questionVectorMinScore: 0, rrfConstant: 60, bm25TimeoutMs: 300, maxTermRows: 2000000, cacheEnabled: false, cacheWeightBytes: 8388608, hybridEnabled: true, version: 1, bm25TopK: 4, vectorTopK: 4, rrfTopN: 6, rerankTopN: 2 }
const errors = [], writes = [], tests = []
page.on('pageerror', error => errors.push(error.message))
const card = () => page.locator('section.panel').filter({ has: page.getByRole('heading', { name: '百炼资料重排序', exact: true }) })
try {
  await page.addInitScript(() => sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'synthetic-preview-token', expiresAt: '2099-01-01T00:00:00Z' })))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body
    if (path.endsWith('/admin/me')) body = { id: 'synthetic-admin', displayName: '演示管理员', role: 'ADMIN' }
    else if (path.endsWith('/admin/users')) body = { items: [], total: 0, page: 1, size: 20 }
    else if (path.endsWith('/admin/config/test')) { tests.push(route.request().postDataJSON()); body = { success: true, message: '合成样例连接成功', latencyMs: 12 } }
    else if (path.endsWith('/admin/config')) {
      if (route.request().method() === 'PUT') {
        const value = route.request().postDataJSON(); writes.push({ path, value })
        config = { ...value, version: config.version + 1, providers: value.providers.map(({ apiKey: _key, ...provider }) => ({ ...provider, hasApiKey: true })) }
      }
      body = config
    } else if (path.endsWith('/admin/reference-policy')) {
      if (route.request().method() === 'PUT') { const value = route.request().postDataJSON(); writes.push({ path, value }); policy = { ...value, version: policy.version + 1 }; await route.fulfill({ status: 204 }); return }
      body = policy
    } else throw new Error(`Unexpected synthetic API: ${path}`)
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.getByRole('button', { name: '模型与服务', exact: true }).click()
  await expect(card().getByText('qwen3-rerank', { exact: true })).toBeVisible()
  await card().getByRole('button', { name: '测试连接', exact: true }).click()
  await expect.poll(() => tests.length).toBe(1)
  expect(tests[0]).toMatchObject({ capability: 'rerank', config: { rerank: { timeoutMs: 1500, model: 'qwen3-rerank' } } })
  expect(writes).toHaveLength(0)
  await card().getByRole('button', { name: '编辑配置', exact: true }).click()
  const editor = page.getByRole('form', { name: '模型服务 百炼资料重排序', exact: true })
  await editor.getByLabel('接口地址', { exact: true }).fill('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank')
  await editor.getByLabel('API Key', { exact: true }).fill('synthetic-replacement-key')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank')
  expect(writes).toHaveLength(0)
  await expect(editor.getByLabel('接口地址', { exact: true })).toHaveValue('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank')
  await editor.getByLabel('接口地址', { exact: true }).fill('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].value.providers[0].url).toBe('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank')
  await expect(editor.getByLabel('API Key', { exact: true })).toHaveValue('')
  await editor.getByRole('button', { name: '取消编辑', exact: true }).click()
  await card().getByRole('button', { name: '停用', exact: true }).click()
  await expect.poll(() => config.rerank.enabled).toBe(false)
  await page.getByRole('button', { name: '资料检索策略', exact: true }).click()
  await expect(page.getByLabel('rerank 保留数 TopN（开启后生效）', { exact: true })).toBeEnabled()
  await page.getByLabel('rerank 保留数 TopN（开启后生效）', { exact: true }).fill('7')
  await page.getByRole('button', { name: '保存资料策略', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('不能超过 RRF')
  expect(writes).toHaveLength(2)
  await page.getByLabel('rerank 保留数 TopN（开启后生效）', { exact: true }).fill('2')
  await page.getByRole('button', { name: '保存资料策略', exact: true }).click()
  await expect.poll(() => writes.length).toBe(3)
  expect(writes[2].value).toMatchObject({ bm25TopK: 4, vectorTopK: 4, rrfTopN: 6, rerankTopN: 2 })
  await card().getByRole('button', { name: '启用', exact: true }).click()
  await expect.poll(() => config.rerank.enabled).toBe(true)
  await mkdir(output, { recursive: true })
  await mkdir(resolve('../assets/readme'), { recursive: true })
  await page.getByRole('heading', { name: '模型与服务', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.locator('.rail-brand img.brand-mark')).toHaveAttribute('src', '/rewick-icon.png')
  await page.screenshot({ path: preview, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('BM25 召回数', { exact: true }).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true })
  await card().getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(card()).toHaveCount(0)
  expect(config.rerank).toMatchObject({ enabled: false, providerId: '', model: '', timeoutMs: 1500 })
  expect(errors).toEqual([])
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: ['测试不发布', '缺少末段路径拦截且不自动补全', '官方完整路径可保存', '启停单活动绑定', '关闭后数量可编辑', '跨数量非法保存拦截', '四数量独立保存', '删除清绑定', '390px 无水平溢出', '原品牌保留'], preview, pageErrors: errors }, null, 2))
  process.stdout.write(`PASS isolated rerank UI; README screenshot: ${preview}\n`)
} catch (error) {
  await mkdir(output, { recursive: true }); await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }); throw error
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve))
}
