import { chromium, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { user, config } from '../tests/fixtures.ts'
import { overview, performance, health, traces } from '../tests/operations-fixtures.ts'
const output = resolve(process.env.ADMIN_APPEARANCE_OUTPUT || 'test-results/appearance') + '/'
await mkdir(output, { recursive: true })
let screenshots = 0
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = [], calls = []
async function screenshot(name) {
  await page.evaluate(async () => { await Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)) })
  await page.screenshot({ path: output+name })
  screenshots++
}
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const users = Array.from({ length: 8 }, (_, i) => ({ ...user, id: String(i + 2), displayName: ['林知远', '陈雨晴', '许景然', '周予安', '孟嘉宁', '苏亦辰', '方明熙', '沈书言'][i], enabled: i !== 5, availableSeconds: 1823 + i * 1317, createdAt: `2026-11-0${i % 3 + 1}T10:20:00+08:00` }))
await page.route('**/api/v1/**', async route => {
  const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
  calls.push(path)
  const payload = path === '/auth/login' ? { accessToken: 'synthetic-preview-only', expiresAt: '2099-01-01T00:00:00Z', user: { id: '1', displayName: '预览管理员' } }
    : path === '/admin/me' ? { id: '1', displayName: '预览管理员', role: 'ADMIN' }
    : path.endsWith('/mock-wallet') ? { availableSeconds: 3600, version: 1 }
    : path === '/admin/config' ? config
    : path === '/admin/operations/overview' ? overview
    : path === '/admin/operations/performance' ? { ...performance, trend: Array.from({ length: 16 }, (_, i) => ({ at: `2026-11-03T${String(i+1).padStart(2, '0')}:00:00+08:00`, count: i * 3 + 7, p95Ms: 1530 + (i % 3) * 420 + i * 30, source: 'desktop' })) }
    : path === '/admin/operations/health' ? health
    : path === '/admin/operations/traces' ? traces
    : path === '/admin/email-config' ? { version: 3, enabled: true, host: 'smtp.example.invalid', port: 587, username: 'mailer@example.invalid', hasPassword: true, from: 'noreply@example.invalid', startTls: true, ssl: false }
    : path === '/admin/packages' ? [{ id: 1, version: 1, name: '标准练习', description: '适合日常面试练习与问题准备', durationSeconds: 3600, originalPriceCents: 1000, discountBps: 8000, priceCents: 800, sortOrder: 0, enabled: true }]
    : path === '/admin/users' ? { items: users, total: users.length, page: 1, size: 20 }
    : { items: [], total: 0, page: 1, size: 20 }
  await route.fulfill({ json: payload })
})
try {
  await page.goto(process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:5174')
  await page.getByRole('heading', { name: '登录管理后台', exact: true }).waitFor()
  await screenshot('login.png')
  await page.getByLabel('管理员账号', { exact: true }).fill('preview-admin')
  await page.getByLabel('登录密码', { exact: true }).fill('synthetic-only')
  await page.getByRole('button', { name: '登录管理后台', exact: true }).click()
  await page.getByRole('heading', { name: '用户管理', level: 2 }).waitFor()
  await page.getByText('沈书言', { exact: true }).waitFor()
  await screenshot('users-light.png')
  const sizes = []
  const height = () => page.locator('tbody tr').first().evaluate(node => node.getBoundingClientRect().height)
  sizes.push(['standard', await height()])
  await page.getByLabel('邮箱或显示名称', { exact: true }).fill('保留的搜索草稿')
  const requestCount = calls.length
  await page.getByRole('button', { name: '外观设置', exact: true }).click()
  await page.getByRole('radio', { name: '深色', exact: true }).check()
  await page.getByRole('radio', { name: /紧凑/ }).check()
  await screenshot('appearance-dark.png')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.getByLabel('邮箱或显示名称', { exact: true })).toHaveValue('保留的搜索草稿')
  if (calls.length !== requestCount) throw new Error('Appearance change unexpectedly fetched business data')
  sizes.push(['compact', await height()])
  await screenshot('users-dark.png')
  await page.getByRole('button', { name: '外观设置', exact: true }).click()
  await page.getByRole('radio', { name: /宽松/ }).check()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  sizes.push(['comfortable', await height()])
  if (!(sizes[1][1] < sizes[0][1] && sizes[0][1] < sizes[2][1])) throw new Error('Density does not change actual table rows: '+JSON.stringify(sizes))
  await page.getByRole('button', { name: '创建用户', exact: true }).click()
  await page.getByRole('dialog', { name: '创建用户', exact: true }).waitFor()
  await screenshot('create-user-dark.png')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '创建用户', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '模型与服务', exact: true }).click()
  await page.getByRole('heading', { name: '模型与服务', level: 2 }).waitFor()
  await screenshot('services-dark.png')
  await page.getByRole('button', { name: '运营观测', exact: true }).click()
  await page.getByRole('region', { name: '业务概览', exact: true }).waitFor()
  await screenshot('operations-dark.png')
  await page.getByRole('button', { name: '性能', exact: true }).click()
  await page.getByRole('img', { name: /按时间展示/ }).waitFor()
  await screenshot('chart-dark.png')
  await page.getByRole('button', { name: '外观设置', exact: true }).click()
  await page.getByRole('radio', { name: '浅色', exact: true }).check()
  await page.getByRole('radio', { name: /标准/ }).check()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await screenshot('chart-light.png')
  await page.getByRole('button', { name: '总览', exact: true }).click()
  await page.getByRole('region', { name: '业务概览', exact: true }).waitFor()
  await screenshot('operations-light.png')
  await page.getByRole('button', { name: '折叠导航', exact: true }).click()
  await screenshot('collapsed.png')
  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  if (overflow) throw new Error('Mobile page overflows horizontally')
  await page.getByRole('button', { name: '打开管理菜单', exact: true }).click()
  await expect(page.getByRole('navigation', { name: '移动管理导航' }).getByText('用户管理', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '移动管理导航' }).getByText('运营管理', { exact: true })).toBeVisible()
  await screenshot('mobile-navigation.png')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '打开管理菜单', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '打开管理菜单', exact: true }).click()
  await page.getByRole('navigation', { name: '移动管理导航' }).getByRole('button', { name: '用户管理', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '管理菜单' })).toBeHidden()
  await screenshot('mobile-users.png')
  await page.getByRole('button', { name: '外观设置', exact: true }).click()
  await screenshot('mobile-appearance.png')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '外观设置', exact: true }).click()
  await page.getByRole('radio', { name: '跟随系统', exact: true }).check()
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  const animations = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)
  if (animations) throw new Error('Animations still running with reduced motion')
  await page.reload()
  await page.getByRole('heading', { name: '用户管理', level: 2 }).waitFor()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  if (errors.length) throw new Error(errors.join('\n'))
  await writeFile(output+'report.json', JSON.stringify({ passed: true, data: 'synthetic isolated API; no production data', sizes, noExtraAppearanceRequests: true, errors, screenshots, reducedMotionAnimations: animations }, null, 2))
  console.log(JSON.stringify({ passed: true, sizes, errors }))
} finally { await browser.close() }
