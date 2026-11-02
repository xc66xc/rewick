import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { overview, performance, health, settings, traces, trace } from '../tests/operations-fixtures.ts'
const root = resolve(process.env.ADMIN_DIST_DIR || 'dist')
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
const errors = []
const calls = []
const urls = []
const chunks = []
let saved = structuredClone(settings)
let outage = false
let staleSnapshot = false, conflict = false
const scenario = {...structuredClone(performance),percentileMethod:'histogram_upper_bound',trendSource:'prometheus',comparisonHours:24}
scenario.trend = [1200, null, 600, 900].map((p95Ms,i)=>({at:`2026-10-13T${12+i}:00:00+08:00`,count:i+3,p95Ms,source:i<2?'desktop':'backend'}))
const traceRows = { ...traces, total: 2, items: [traces.items[0], {
  ...traces.items[0], operationId: '11111111-1111-4111-8111-111111111112',
  operationType: 'session-sync', model: null, appVersion: '2.0.8', outcome: 'error'
}] }
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (request.url().includes('OperationsTrend-') && new URL(request.url()).pathname.endsWith('.js')) chunks.push(request.url()) })
try {
  await mkdir('test-results/operations', { recursive: true })
  await page.addInitScript(() => sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'isolated-test-token', expiresAt: '2099-01-01T00:00:00Z' })))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    calls.push(path); urls.push(route.request().url())
    let body
    if (path.endsWith('/admin/me')) body = { id: 'isolated-admin', displayName: '隔离管理员', role: 'ADMIN' }
    else if (path.endsWith('/admin/users')) body = { items: [], total: 0, page: 1, size: 20 }
    else if (path.endsWith('/overview')) body = staleSnapshot ? {...overview,stale:true,business:{...overview.business,activeUsers:null,stale:true}} : overview
    else if (path.endsWith('/performance')) body = scenario
    else if (path.endsWith('/health')) body = health
    else if (path.endsWith('/settings')) {
      if (route.request().method() === 'PUT' && !conflict) saved = { ...route.request().postDataJSON(), version: saved.version + 1 }
      body = saved
    } else if (path.endsWith('/traces')) body = traceRows
    else if (path.endsWith(`/traces/${trace.operationId}`)) body = trace
    else throw new Error(`Unexpected mock API ${path}`)
    await route.fulfill({ status: conflict && path.endsWith('/settings') && route.request().method()==='PUT' ? 409 : outage && path.includes('/operations/') ? 503 : 200, contentType: 'application/json', body: JSON.stringify(conflict && path.endsWith('/settings') && route.request().method()==='PUT' ? {message:'版本冲突'} : outage ? { message: '监控存储不可用' } : body) })
  })
  await page.clock.install()
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.getByRole('button', { name: '运营观测', exact: true }).click()
  await expect(page.getByRole('region', { name: '业务概览' })).toBeVisible()
  expect(chunks).toHaveLength(0)
  await expect(page.getByRole('combobox',{name:'时间范围'})).toContainText('最近 24 小时')
  await expect(page.getByText('客户端覆盖率',{exact:true})).toBeVisible()
  await expect(page.getByText('未知',{exact:true}).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/operations/overview.png', fullPage: true })
  const count = calls.filter(path => path.endsWith('/overview')).length
  await page.clock.fastForward(31000)
  await expect.poll(() => calls.filter(path => path.endsWith('/overview')).length).toBe(count + 1)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, value:true }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.fastForward(61000)
  expect(calls.filter(path => path.endsWith('/overview'))).toHaveLength(count + 1)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, value:false }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => calls.filter(path => path.endsWith('/overview')).length).toBe(count + 2)
  await page.getByRole('button', { name: '用户管理', exact: true }).click()
  const hiddenCount = calls.filter(path => path.endsWith('/overview')).length
  await page.clock.fastForward(61000)
  expect(calls.filter(path => path.endsWith('/overview'))).toHaveLength(hiddenCount)
  await page.getByRole('button', { name: '运营观测', exact: true }).click()
  await expect(page.getByRole('region', { name: '业务概览' })).toBeVisible()
  await page.getByRole('radio', { name: '性能', exact: true }).click()
  await expect(page.getByRole('img', { name: /按时间展示回答 P95/ })).toBeVisible()
  await expect.poll(() => chunks.length).toBe(1)
  await expect(page.getByText('样本不足 100', { exact: true })).toBeVisible()
  await expect(page.getByText(/趋势来自 Prometheus/)).toBeVisible()
  await expect(page.getByText(/阶段表分位数来自监控数据库直方图桶上界/)).toBeVisible()
  const plot=page.getByRole('img',{name:/按时间展示回答 P95/})
  await expect(plot.locator('.trend-point')).toHaveCount(3)
  await expect(plot.locator('.trend-line')).toHaveCount(1)
  const bounds=await plot.boundingBox();await plot.hover({position:{x:44+(bounds.width-60)/3,y:60}})
  await expect(plot.getByRole('status')).toContainText('P95：未知')
  await expect(plot.getByRole('status')).toContainText('样本数 4')
  await page.screenshot({ path: 'test-results/operations/performance.png', fullPage: true })
  await page.getByRole('radio', { name: '操作链路', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: '模型 / 客户端版本', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '会话同步', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '不涉及模型 客户端 2.0.8', exact: true })).toBeVisible()
  await expect(page.getByText('客户端 2.0.8', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/operations/trace-list.png', fullPage: true })
  await page.getByRole('textbox',{name:'用户 ID',exact:true}).fill('7')
  await page.getByRole('textbox',{name:'操作 ID',exact:true}).fill('invalid')
  const detailsBefore=calls.filter(path=>/\/traces\//.test(path)).length
  await page.getByRole('button',{name:'查看指定操作',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('有效的操作 UUID')
  expect(calls.filter(path=>/\/traces\//.test(path))).toHaveLength(detailsBefore)
  await page.getByRole('combobox',{name:'时间范围'}).click();await page.getByRole('option',{name:'最近 30 天',exact:true}).click()
  await expect.poll(()=>urls.some(url=>url.includes('/traces?')&&url.includes('hours=168'))).toBe(true)
  await page.getByRole('button', { name: '查看链路', exact: true }).first().click()
  await expect.poll(()=>urls.some(url=>url.includes(`/traces/${trace.operationId}?userId=7`))).toBe(true)
  await expect(page.getByRole('region', { name: '客户端泳道' })).toBeVisible()
  await expect(page.getByRole('region', { name: '后端泳道' })).toBeVisible()
  await expect(page.getByText(`父 span：${trace.events[1].spanId}`,{exact:true})).toBeVisible()
  await expect(page.getByText(/链路不完整：可能存在采集关闭/)).toBeVisible()
  await page.screenshot({ path: 'test-results/operations/traces.png', fullPage: true })
  await page.getByRole('radio', { name: '健康', exact: true }).click()
  await expect(page.getByText('采集队列积压', { exact: true })).toBeVisible()
  await expect(page.getByRole('region',{name:'首段字幕 P95 未知',exact:true})).toBeVisible()
  await page.screenshot({ path: 'test-results/operations/health.png', fullPage: true })
  await page.getByRole('button', { name: '观测设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '运营观测设置', exact: true })
  await dialog.getByRole('switch', {name:'开启采集',exact:true}).focus();await page.keyboard.press('Space');await expect(dialog.getByRole('switch',{name:'开启采集',exact:true})).toBeChecked()
  await dialog.getByLabel(/灰度用户 ID/).fill('7\n8\n7')
  await dialog.getByLabel('最小样本数', { exact: true }).fill('30')
  await dialog.getByRole('button', { name: '保存观测设置', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('版本 2')
  expect(saved.allowedUserIds).toEqual(['7', '8'])
  expect(saved.thresholds.minSamples).toBe(30)
  await page.screenshot({ path: 'test-results/operations/settings.png', fullPage: true })
  conflict=true;await dialog.getByLabel(/灰度用户 ID/).fill('9')
  await dialog.getByRole('button',{name:'保存观测设置',exact:true}).click()
  await expect(dialog.getByRole('alert')).toContainText('版本冲突')
  await expect(dialog.getByLabel(/灰度用户 ID/)).toHaveValue('9');expect(saved.allowedUserIds).toEqual(['7','8']);conflict=false
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.setViewportSize({ width: 900, height: 1100 })
  await page.getByRole('radio', { name: '总览', exact: true }).click()
  await expect(page.getByRole('region', { name: '业务概览' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/operations/overview-narrow.png', fullPage: true })
  staleSnapshot=true
  await page.getByRole('button',{name:'刷新观测',exact:true}).click()
  await expect(page.getByText('当前观测数据不完整或已过期，空列表与未知值不代表没有业务活动。',{exact:true})).toBeVisible()
  await expect(page.getByRole('region',{name:'当日活跃用户 未知',exact:true})).toBeVisible()
  outage = true
  await page.getByRole('button', { name: '刷新观测', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('运营观测暂不可用')
  await expect(page.getByRole('region', { name: '业务概览' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/operations/unavailable.png', fullPage: true })
  expect(errors).toEqual([])
  await writeFile('test-results/operations/report.json', JSON.stringify({ data:'isolated synthetic API; no production or supplier calls', runtime:'built Vue UI / lazy SVG', requestedUrls:urls, passed: ['总览', '真实SVG趋势组件懒加载', '低样本标识', '独立时钟泳道', '容量健康', '设置灰度与阈值发布/409保留草稿', '空缺趋势不补0/不跨来源连线', 'Prometheus趋势与SQL桶上界分离', '无效UUID无详情请求/详情必带userId/七天上限', '过期未知业务不补零', '30 秒轮询', '隐藏窗口停止', '非当前页面停止', '窄屏布局', '503 不伪造零'], pageErrors: errors }, null, 2))
  process.stdout.write('PASS operations built UI: four tabs, lazy SVG trend, settings, polling, hidden pause and outage\n')
} catch (error) {
  await page.screenshot({ path: 'test-results/operations/failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
