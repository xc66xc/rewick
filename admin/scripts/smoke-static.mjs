import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const execute = promisify(execFile)
const name = `copilot-admin-static-${Date.now()}`
const image = 'interview-copilot-admin:local'
let browser
try {
  await execute('docker', ['run', '--rm', '-d', '--name', name, '--add-host', 'backend:127.0.0.1', '-p', '127.0.0.1::80', image])
  const { stdout } = await execute('docker', ['port', name, '80/tcp'])
  const url = `http://${stdout.trim()}`
  let response
  for (let attempt = 0; attempt < 30; attempt++) {
    try { response = await fetch(url); if (response.ok) break } catch { /* Only wait for this owned container to start. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!response?.ok) throw new Error('Nginx page unavailable')
  const headers = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'cache-control']
  for (const key of headers) if (!response.headers.get(key)) throw new Error(`Missing ${key}`)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(url)
  await page.getByRole('button', { name: '登录管理后台', exact: true }).waitFor()
  if (errors.length) throw new Error(errors.join('\n'))
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/login-production.png' })
  await writeFile('test-results/nginx-report.json', JSON.stringify({ image,
    headers: Object.fromEntries([...response.headers].filter(([key]) => headers.includes(key))), pageErrors: errors }, null, 2))
  process.stdout.write('PASS built Nginx image, security headers, React login and CSP without browser errors\n')
} finally {
  await browser?.close()
  await execute('docker', ['rm', '-f', name]).catch(() => undefined)
}
