import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { overview, performance, health, settings, traces, trace } from '../tests/operations-fixtures.ts'
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const errors = []
const calls = []
const chunks = []
let saved = structuredClone(settings)
let outage = false
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (request.url().includes('OperationsTrend-')) chunks.push(request.url()) })
try {
  await mkdir('test-results/operations', { recursive: true })
  await page.addInitScript(() => sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'isolated-test-token', expiresAt: '2099-01-01T00:00:00Z' })))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    calls.push(path)
    let body
    if (path.endsWith('/admin/me')) body = { id: 'isolated-admin', displayName: '隔离管理员', role: 'ADMIN' }
    else if (path.endsWith('/admin/users')) body = { items: [], total: 0, page: 1, size: 20 }
    else if (path.endsWith('/overview')) body = overview
    else if (path.endsWith('/performance')) body = performance
    else if (path.endsWith('/health')) body = health
    else if (path.endsWith('/settings')) {
      if (route.request().method() === 'PUT') saved = { ...route.request().postDataJSON(), version: saved.version + 1 }
      body = saved
    } else if (path.endsWith('/traces')) body = traces
    else if (path.endsWith(`/traces/${trace.operationId}`)) body = trace
    else throw new Error(`Unexpected mock API ${path}`)
    await route.fulfill({ status: outage && path.includes('/operations/') ? 503 : 200, contentType: 'application/json', body: JSON.stringify(outage ? { message: '监控存储不可用' } : body) })
  })
  await page.clock.install()
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.getByRole('button', { name: '运营观测', exact: true }).click()
  await expect(page.getByRole('region', { name: '业务概览' })).toBeVisible()
  expect(chunks).toHaveLength(0)
  await expect(page.getByLabel(/时间范围/)).toHaveValue('24')
  await page.screenshot({ path: 'test-results/operations/overview.png', fullPage: true })
  const count = calls.filter(path => path.endsWith('/overview')).length
  await page.clock.fastForward(31000)
  await expect.poll(() => calls.filter(path => path.endsWith('/overview')).length).toBe(count + 1)
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.fastForward(61000)
  expect(calls.filter(path => path.endsWith('/overview'))).toHaveLength(count + 1)
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => calls.filter(path => path.endsWith('/overview')).length).toBe(count + 2)
  await page.getByRole('button', { name: '用户管理', exact: true }).click()
  const hiddenCount = calls.filter(path => path.endsWith('/overview')).length
  await page.clock.fastForward(61000)
  expect(calls.filter(path => path.endsWith('/overview'))).toHaveLength(hiddenCount)
  await page.getByRole('button', { name: '运营观测', exact: true }).click()
  await expect(page.getByRole('region', { name: '业务概览' })).toBeVisible()
  await page.getByRole('button', { name: '性能', exact: true }).click()
  await expect(page.getByRole('img', { name: /按时间展示回答 P95/ })).toBeVisible()
  await expect.poll(() => chunks.length).toBe(1)
  await expect(page.getByText('样本不足 100', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/operations/performance.png', fullPage: true })
  await page.getByRole('button', { name: '操作链路', exact: true }).click()
  await page.getByRole('button', { name: '查看链路', exact: true }).click()
  await expect(page.getByRole('region', { name: '客户端泳道' })).toBeVisible()
  await expect(page.getByRole('region', { name: '后端泳道' })).toBeVisible()
  await page.screenshot({ path: 'test-results/operations/traces.png', fullPage: true })
  await page.getByRole('button', { name: '健康', exact: true }).click()
  await expect(page.getByText('采集队列积压', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/operations/health.png', fullPage: true })
  await page.getByRole('button', { name: '观测设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '运营观测设置', exact: true })
  await dialog.getByLabel('开启采集', { exact: true }).check()
  await dialog.getByLabel(/灰度用户 ID/).fill('7\n8\n7')
  await dialog.getByLabel('最小样本数', { exact: true }).fill('30')
  await dialog.getByRole('button', { name: '保存观测设置', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('版本 2')
  expect(saved.allowedUserIds).toEqual(['7', '8'])
  expect(saved.thresholds.minSamples).toBe(30)
  await page.screenshot({ path: 'test-results/operations/settings.png', fullPage: true })
  await dialog.getByRole('button', { name: '关闭运营观测设置', exact: true }).click()
  await page.setViewportSize({ width: 900, height: 1100 })
  await page.getByRole('button', { name: '总览', exact: true }).click()
  await expect(page.getByRole('region', { name: '业务概览' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/operations/overview-narrow.png', fullPage: true })
  outage = true
  await page.getByRole('button', { name: '刷新观测', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('运营观测暂不可用')
  await expect(page.getByRole('region', { name: '业务概览' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/operations/unavailable.png', fullPage: true })
  expect(errors).toEqual([])
  await writeFile('test-results/operations/report.json', JSON.stringify({ passed: ['总览', '真实 ECharts 懒加载', '低样本标识', '独立时钟泳道', '容量健康', '设置灰度与阈值发布', '30 秒轮询', '隐藏窗口停止', '非当前页面停止', '窄屏布局', '503 不伪造零'], pageErrors: errors }, null, 2))
  process.stdout.write('PASS operations built UI: four tabs, real ECharts, settings, polling, hidden pause and outage\n')
} catch (error) {
  await page.screenshot({ path: 'test-results/operations/failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
