import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium, expect } from '@playwright/test'

// Isolated built-UI verification: all API calls stay in browser mocks.
const root = resolve('dist')
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
let config = { version: 1, providers: [], models: [], defaultModelId: '', asr: { enabled: false, providerId: '', model: '' }, embedding: { enabled: false, providerId: '', model: '', dimensions: 1024 } }
const servicePanel = name => page.locator('section.panel').filter({ has: page.getByRole('heading', { name, exact: true }) })
async function select(scope, name, option) {
  await scope.getByRole('combobox', { name, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
const tests = []
const publications = []
try {
  await page.addInitScript(() => sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'isolated-test-token', expiresAt: '2099-01-01T00:00:00Z' })))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body = {}
    if (path.endsWith('/admin/me')) body = { id: 'isolated-admin', displayName: '隔离管理员', role: 'ADMIN' }
    else if (path.endsWith('/admin/users')) body = { items: [], total: 0, page: 1, size: 20 }
    else if (path.endsWith('/admin/config/test')) {
      tests.push(route.request().postDataJSON()); body = { success: true, message: '连接成功', latencyMs: 5 }
    } else if (path.endsWith('/admin/config')) {
      if (route.request().method() === 'PUT') {
        const input = route.request().postDataJSON(); publications.push(input)
        config = { ...input, version: config.version + 1, providers: input.providers.map(({ apiKey: _key, ...provider }) => ({ ...provider, hasApiKey: true })) }
      }
      body = config
    } else throw new Error(`Unexpected mock API: ${path}`)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.getByRole('button', { name: '模型与服务', exact: true }).click()
  await page.getByRole('button', { name: '添加服务', exact: true }).click()
  await page.getByRole('button', { name: '添加联网搜索', exact: true }).click()
  const draft = page.getByRole('form', { name: '模型服务 新服务', exact: true })
  await expect(draft.getByLabel('接口地址', { exact: true })).toHaveValue('https://api.tavily.com/search')
  await expect(draft.getByLabel('模型名称', { exact: true })).toHaveCount(0)
  await draft.getByLabel('显示名称', { exact: true }).fill('Tavily 联网搜索')
  await draft.getByLabel('API Key', { exact: true }).fill('isolated-fake-key')
  await draft.getByLabel('保留网页数量（topK）', { exact: true }).fill('6')
  await select(draft, '搜索深度', '基础搜索')
  await draft.getByLabel('超时（毫秒）', { exact: true }).fill('6000')
  await select(draft, '包含摘要答案', '高级摘要')
  // Exercise every Tavily depth × include_answer combination through Vue's Select portal.
  for (const [depth, depthLabel] of [['basic', '基础搜索'], ['advanced', '高级搜索'], ['fast', '快速搜索'], ['ultra-fast', '极速搜索']]) {
    for (const [answer, answerLabel] of [['none', '不包含'], ['basic', '基础摘要'], ['advanced', '高级摘要']]) {
      await select(draft, '搜索深度', depthLabel)
      await select(draft, '包含摘要答案', answerLabel)
      const count = tests.length
      await draft.getByRole('button', { name: '测试连接', exact: true }).click()
      await expect.poll(() => tests.length).toBe(count + 1)
      expect(tests.at(-1).config.webSearch).toMatchObject({ topK: 6, searchDepth: depth, includeAnswer: answer, timeoutMs: 6000 })
      expect(tests.at(-1)).toMatchObject({ capability: 'web-search' })
      expect(tests.at(-1)).not.toHaveProperty('modelId')
      expect(publications).toHaveLength(0)
    }
  }
  await select(draft, '搜索深度', '基础搜索')
  await select(draft, '包含摘要答案', '高级摘要')
  await draft.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '未保存配置' })).toBeVisible()
  expect(tests[0].capability).toBe('web-search')
  expect(tests.at(-1).config.webSearch.includeAnswer).toBe('advanced')
  expect(tests[0]).not.toHaveProperty('modelId')
  expect(publications).toHaveLength(0)
  await draft.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存并启用' })).toBeVisible()
  const saved = page.getByRole('form', { name: '模型服务 Tavily 联网搜索', exact: true })
  await expect(saved.getByLabel('API Key', { exact: true })).toHaveValue('')
  await mkdir('test-results/tavily', { recursive: true })
  await page.screenshot({ path: 'test-results/tavily/editor.png', fullPage: true })
  await saved.getByRole('button', { name: '取消编辑', exact: true }).click()
  const overview = servicePanel('Tavily 联网搜索')
  await expect(overview.getByText('6 条', { exact: true })).toBeVisible()
  await expect(overview.getByText('高级摘要', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/tavily/overview.png', fullPage: true })
  await overview.getByRole('button', { name: '停用', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '已停用' })).toBeVisible()
  expect(config.webSearch.enabled).toBe(false)
  await overview.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(overview).toHaveCount(0)
  expect(config.webSearch.providerId).toBe('')
  await page.getByRole('button', { name: '添加服务', exact: true }).click()
  await page.getByRole('button', { name: '添加联网搜索', exact: true }).click()
  const deepseek = page.getByRole('form', { name: '模型服务 新服务', exact: true })
  await select(deepseek, '搜索供应商', 'DeepSeek 搜索')
  await expect(deepseek.getByLabel('接口地址', { exact: true })).toHaveValue('https://api.deepseek.com/v1/tools/search')
  await expect(deepseek.getByRole('combobox', { name: /搜索深度/ })).toHaveCount(0)
  await expect(deepseek.getByRole('combobox', { name: /包含摘要答案/ })).toHaveCount(0)
  // A custom proxy URL survives supplier changes, but a secret never crosses suppliers.
  await deepseek.getByLabel('接口地址', { exact: true }).fill('https://proxy.example.invalid/search')
  await deepseek.getByLabel('API Key', { exact: true }).fill('isolated-discarded-key')
  await select(deepseek, '搜索供应商', 'Tavily 搜索')
  await expect(deepseek.getByLabel('接口地址', { exact: true })).toHaveValue('https://proxy.example.invalid/search')
  await expect(deepseek.getByLabel('API Key', { exact: true })).toHaveValue('')
  await select(deepseek, '搜索供应商', 'DeepSeek 搜索')
  await expect(deepseek.getByLabel('接口地址', { exact: true })).toHaveValue('https://proxy.example.invalid/search')
  await deepseek.getByLabel('接口地址', { exact: true }).fill('https://api.deepseek.com/v1/tools/search')
  await deepseek.getByLabel('显示名称', { exact: true }).fill('DeepSeek 联网搜索')
  await deepseek.getByLabel('API Key', { exact: true }).fill('isolated-deepseek-key')
  const publishedBeforeDeepseekTest = publications.length
  const testsBeforeDeepseek = tests.length
  await deepseek.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect.poll(() => tests.length).toBe(testsBeforeDeepseek + 1)
  expect(publications).toHaveLength(publishedBeforeDeepseekTest)
  expect(tests.at(-1)).not.toHaveProperty('modelId')
  await expect(page.getByRole('status').filter({ hasText: '未保存配置' })).toBeVisible()
  expect(tests.at(-1).config.providers.find(provider => provider.kind === 'web-search').searchProtocol).toBe('deepseek')
  await deepseek.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '已保存并启用' })).toBeVisible()
  await mkdir('test-results/deepseek', { recursive: true })
  await page.screenshot({ path: 'test-results/deepseek/editor.png', fullPage: true })
  await page.getByRole('form', { name: '模型服务 DeepSeek 联网搜索', exact: true }).getByRole('button', { name: '取消编辑', exact: true }).click()
  const deepseekOverview = servicePanel('DeepSeek 联网搜索')
  await expect(deepseekOverview.getByText('DeepSeek 搜索', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/deepseek/overview.png', fullPage: true })
  expect(errors).toEqual([])
  await writeFile('test-results/tavily/report.json', JSON.stringify({ passed: ['旧配置加载', '创建及默认地址', 'Tavily十二种深度与摘要组合参数', '草稿测试且不发布', '保存及密钥清空', '概览参数', '停用', '删除', 'DeepSeek协议选择及参数可见性', 'DeepSeek草稿测试及保存', '供应商切换清密钥且保留自定义代理地址'], pageErrors: errors }, null, 2))
  process.stdout.write('PASS Tavily and DeepSeek built UI: create, parameters, test, save, overview, disable and delete\n')
} catch (error) {
  await mkdir('test-results/tavily', { recursive: true })
  await page.screenshot({ path: 'test-results/tavily/failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
