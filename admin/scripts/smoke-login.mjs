import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium, webkit, expect } from '@playwright/test'

// toBeVisible intentionally accepts opacity:0. Check actual painted opacity
// after entrance cleanup, both during a normal clock tick and after interruptions.
const root = resolve(process.env.ADMIN_DIST_DIR || 'dist')
const output = resolve(process.env.ADMIN_LOGIN_OUTPUT || 'test-results/login')
await mkdir(output, { recursive: true })
let server
let baseUrl = process.env.ADMIN_PREVIEW_URL
if (!baseUrl) {
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname
    const target = resolve(root, `.${path === '/' ? '/index.html' : path}`)
    if (!target.startsWith(`${root}/`)) { response.writeHead(404).end(); return }
    try {
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'")
      response.setHeader('Content-Type', { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png' }[extname(target)] || 'application/octet-stream')
      response.end(await readFile(target))
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
}
const engines = { chromium, webkit }
const names = (process.env.BROWSER_ENGINES || 'chromium').split(',')
const scenarios = ['animated', 'reduced', 'initially-hidden', 'hide-during-entry', 'reduce-during-entry']
const results = []
try {
  for (const name of names) {
    if (!engines[name]) throw Error(`Unsupported browser engine: ${name}`)
    const browser = await engines[name].launch({ headless:true })
    try {
      for (const scenario of scenarios) {
        const context = await browser.newContext({ viewport:{width:1440,height:1000}, reducedMotion:scenario==='reduced'?'reduce':'no-preference' })
        const page = await context.newPage(), errors = [], apiCalls = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type()==='error') errors.push(message.text()) })
        await page.route('**/api/v1/**', route => { apiCalls.push(route.request().url()); return route.fulfill({status:401,contentType:'application/json',body:'{}'}) })
        if (scenario==='initially-hidden') await context.addInitScript(() => { Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}) })
        try {
          await page.goto(baseUrl)
          await page.getByRole('heading',{name:'登录管理后台',exact:true}).waitFor()
          await page.waitForTimeout(200)
          if (scenario==='hide-during-entry') await page.evaluate(() => {
            Object.defineProperty(document,'hidden',{configurable:true,get:()=>true})
            document.dispatchEvent(new Event('visibilitychange'))
          })
          if (scenario==='reduce-during-entry') await page.emulateMedia({reducedMotion:'reduce'})
          if (scenario==='initially-hidden'||scenario==='hide-during-entry') await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
          await page.waitForTimeout(2400)
          const samples = []
          for (let sample=0;sample<2;sample++) {
            const painted = await page.locator('.login-brand,.hero-line,.cap-item,.login-plate,.login-dial,.login-card').evaluateAll(nodes => nodes.map(node => ({kind:node.className,opacity:Number(getComputedStyle(node).opacity),display:getComputedStyle(node).display})))
            expect(painted.length).toBeGreaterThan(8)
            for (const node of painted) { expect(node.opacity,`${name}/${scenario}: ${node.kind}`).toBeGreaterThan(.99); expect(node.display).not.toBe('none') }
            samples.push(painted)
            if (sample===0) await page.waitForTimeout(1200)
          }
          await page.getByRole('textbox',{name:'管理员账号',exact:true}).fill('synthetic-visibility-check')
          await expect(page.getByRole('textbox',{name:'管理员账号',exact:true})).toHaveValue('synthetic-visibility-check')
          expect(errors).toEqual([]); expect(apiCalls).toEqual([])
          await page.screenshot({path:resolve(output,`${name}-${scenario}.png`)})
          results.push({name,scenario,samples,errors,apiCalls})
        } catch(error) { await page.screenshot({path:resolve(output,`${name}-${scenario}-failure.png`)}); throw error }
        finally { await context.close() }
      }
    } finally { await browser.close() }
  }
  await writeFile(resolve(output,'report.json'),JSON.stringify({passed:true,baseUrl,results},null,2))
  console.log(`PASS ${results.length} painted login visibility scenarios: ${names.join(', ')}`)
} finally { if (server) await new Promise(resolve=>server.close(resolve)) }
