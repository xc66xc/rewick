import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium, expect } from '@playwright/test'

// Real AnswerCard and diagnostics, isolated synthetic props, no bridge, account or supplier.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'test-results/multi-question-ui')
const entry = 'tests/e2e/multi-question.html'
const errors = [], checks = [], external = []
await mkdir(output, { recursive: true })
const options = { configFile: false, root, plugins: [react(), tailwindcss()], resolve: { alias: { '@': join(root, 'src/renderer/src') } } }
const development = await createServer({ ...options, optimizeDeps: { entries: [entry] }, server: { host: '127.0.0.1', port: 0 } })
await development.listen()
let production
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 })
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', route => {
  const url = new URL(route.request().url())
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.origin); return route.abort() }
  return route.continue()
})
const base = server => `http://127.0.0.1:${server.httpServer.address().port}`
try {
  await page.goto(`${base(development)}/${entry}`)
  const card = page.getByRole('article', { name: '回答 1', exact: true })
  await expect(card.getByRole('heading', { name: /你们项目用了 Reactor/ })).toBeVisible()
  await card.getByRole('button', { name: '问题提取 · 已整理 · 3 题', exact: true }).click()
  for (const [id, text] of [['q1', '除了 ReAct，还有哪些常见的 Agent 模式？'], ['q2', 'SSE 是什么？'], ['q3', 'MCP 除了 SSE，还支持哪些传输方式？']]) {
    await expect(card.getByRole('heading', { name: `${id} · ${text}`, exact: true })).toBeVisible()
    await expect(card.getByText(`原话来源：${text}`, { exact: true })).toBeVisible()
  }
  await expect(card.getByText('检索：ready · 实际送入 1 份证据', { exact: true })).toHaveCount(3)
  await card.getByRole('button', { name: /本次检索资料/ }).click()
  for (const id of ['q1', 'q2', 'q3']) {
    await expect(card.getByText(`${id} · ready · 实际送入 1 份证据`, { exact: true })).toBeVisible()
    await expect(card.getByText(`问题归属：${id}`, { exact: true })).toBeVisible()
  }
  await expect(card.getByText(/本地混合检索：/)).toHaveCount(3)
  checks.push('DEV three extracted questions, original anchors and per-question actual evidence')
  await page.screenshot({ path: join(output, 'multi-question.png'), fullPage: true, animations: 'disabled' })
  await page.goto(`${base(development)}/${entry}?scenario=legacy`)
  await expect(card.getByRole('heading', { name: '之前那个 SSE，你简单解释一下？', exact: true })).toBeVisible()
  await card.getByRole('button', { name: '问题整理 · 已整理', exact: true }).click()
  await expect(card.getByText('请解释 SSE。', { exact: true })).toBeVisible()
  checks.push('DEV existing scalar rewrite remains readable')

  const outDir = join(output, 'production')
  // A dev server sets NODE_ENV in this same process; packaging runs a separate
  // production process, so explicitly restore that real build environment here.
  const previousEnvironment = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ ...options, mode: 'production', build: { outDir, emptyOutDir: true, rollupOptions: { input: join(root, entry) } } })
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnvironment
  }
  production = await preview({ configFile: false, root, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } })
  for (const scenario of ['', '?scenario=legacy']) {
    await page.goto(`${base(production)}/${entry}${scenario}`)
    await expect(page.getByText(/生产构建：仅展示问题与回答/)).toBeVisible()
    await expect(card.getByText('已完成', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: /问题提取|问题整理|本次发送内容|本次检索资料/ })).toHaveCount(0)
    await expect(card.getByText(/原话来源：|问题归属：|实际送入/)).toHaveCount(0)
  }
  checks.push('Production build omits all extraction/model-input/evidence diagnostics for v1 and v2')
  await page.screenshot({ path: join(output, 'production.png'), fullPage: true, animations: 'disabled' })
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  await writeFile(join(output, 'report.json'), `${JSON.stringify({ passed: true, checks, errors, external }, null, 2)}\n`)
  console.log(`PASS ${checks.length} isolated real-component browser checks`)
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png'), fullPage: true })
  await writeFile(join(output, 'report.json'), `${JSON.stringify({ passed: false, checks, errors, external, error: String(error) }, null, 2)}\n`)
  throw error
} finally {
  await browser.close()
  await development.close()
  if (production) await new Promise(resolve => production.httpServer.close(resolve))
}
