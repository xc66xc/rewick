import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function runAdminSmoke({ baseUrl, username, password, output = 'admin/test-results/smoke' }) {
  if (!baseUrl || !username || !password) throw new Error('管理端 smoke 需要 baseUrl、username、password。仅用于隔离测试后端。')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const passed = []
  const testUsername = `admin-smoke-${Date.now().toString(36)}`
  const testPassword = `Admin-smoke-${crypto.randomUUID()}!`
  let token = ''
  let initialConfig
  let createdUserId
  async function api(path, method = 'GET', body) {
    const response = await context.request.fetch(`${baseUrl}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { data: body }) })
    if (!response.ok()) throw new Error(`管理端 smoke API ${method} ${path} 返回 HTTP ${response.status()}`)
    return response.status() === 204 ? undefined : response.json()
  }
  function configBody(config) { return { ...config, providers: config.providers.map(({ hasApiKey, apiKey, ...provider }) => provider) } }
  try {
    await page.goto(baseUrl)
    await page.getByLabel('管理员账号', { exact: true }).fill(username)
    await page.getByLabel('登录密码', { exact: true }).fill(password)
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST')
    await page.getByRole('button', { name: '登录管理后台', exact: true }).click()
    const login = await (await loginResponse).json()
    if (!login.accessToken) throw new Error('隔离管理员登录失败。')
    token = login.accessToken
    await expect(page.getByRole('heading', { name: '平台用户', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
    passed.push('管理员鉴权与内存登录')
    initialConfig = await api('/admin/config')

    await page.getByRole('button', { name: '创建用户', exact: true }).click()
    const create = page.getByRole('dialog', { name: '创建用户', exact: true })
    await create.getByLabel('用户名', { exact: true }).fill(testUsername)
    await create.getByLabel('初始密码', { exact: true }).fill(testPassword)
    await create.getByLabel('每日回答次数', { exact: true }).fill('15')
    await create.getByLabel('每日知识检索次数', { exact: true }).fill('12')
    const creation = page.waitForResponse(response => response.url().endsWith('/api/v1/admin/users') && response.request().method() === 'POST')
    await create.getByRole('button', { name: '创建用户', exact: true }).click()
    const created = await (await creation).json()
    if (!created.id) throw new Error('测试用户创建失败。')
    createdUserId = created.id
    await expect(create).not.toBeVisible()
    await page.getByLabel('搜索用户名', { exact: true }).fill(testUsername)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByRole('button', { name: `编辑 ${testUsername}`, exact: true }).click()
    const edit = page.getByRole('dialog', { name: `编辑用户 · ${testUsername}`, exact: true })
    await edit.getByLabel('每日回答次数', { exact: true }).fill('0')
    await edit.getByLabel('启用账号', { exact: true }).uncheck()
    await edit.getByRole('button', { name: '保存用户', exact: true }).click()
    const disable = page.getByRole('dialog', { name: `停用 ${testUsername}`, exact: true })
    await disable.getByRole('button', { name: '取消', exact: true }).click()
    await expect(edit).toBeVisible()
    await edit.getByRole('button', { name: '保存用户', exact: true }).click()
    await page.getByRole('dialog', { name: `停用 ${testUsername}`, exact: true }).getByRole('button', { name: '确认停用', exact: true }).click()
    await expect(edit).not.toBeVisible()
    const user = await api(`/admin/users?query=${encodeURIComponent(testUsername)}&page=1&size=20`)
    expect(user.items[0]).toMatchObject({ enabled: false, dailyAnswers: 0 })
    await page.getByRole('button', { name: `编辑 ${testUsername}`, exact: true }).click()
    await page.getByRole('dialog').getByLabel('启用账号', { exact: true }).check()
    await page.getByRole('dialog').getByRole('button', { name: '保存用户', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: `重置密码 ${testUsername}`, exact: true }).click()
    await page.getByRole('dialog').getByLabel('新密码', { exact: true }).fill(`${testPassword}-reset`)
    await page.getByRole('dialog').getByRole('button', { name: '重置密码并撤销登录', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: `撤销登录 ${testUsername}`, exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '撤销全部登录', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    passed.push('用户创建、搜索、额度、启停、密码重置和撤销')
    await page.screenshot({ path: resolve(output, 'users.png'), fullPage: true })

    await page.getByRole('button', { name: '平台配置', exact: true }).click()
    await expect(page.getByRole('heading', { name: '模型与服务', exact: true })).toBeVisible()
    const provider = initialConfig.providers.find(item => item.kind === 'llm' && item.enabled)
    if (provider) {
      const card = page.getByRole('group', { name: `服务配置 ${provider.name}`, exact: true })
      await card.getByLabel('服务名称', { exact: true }).fill(`${provider.name} · 管理验证`)
      await page.getByRole('button', { name: '发布配置', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('已发布')
      await page.getByRole('button', { name: '添加模型', exact: true }).click()
      const model = page.getByRole('group', { name: /^模型配置 model-/ }).last()
      const actual = initialConfig.models.find(item => item.providerId === provider.id)
      await model.getByLabel('显示名称', { exact: true }).fill('管理端验证模型')
      const modelFields = page.getByRole('group', { name: '模型配置 管理端验证模型', exact: true })
      const providerSelect = modelFields.getByRole('combobox', { name: /^所属服务/ })
      await providerSelect.selectOption(provider.id)
      await expect(providerSelect).toHaveValue(provider.id)
      await modelFields.getByLabel('供应商模型名称', { exact: true }).fill(actual?.model || 'mock-model')
      await page.getByRole('button', { name: '发布配置', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('已发布')
      const testModel = page.getByRole('group', { name: '模型配置 管理端验证模型', exact: true })
      await testModel.getByRole('button', { name: '测试此模型', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('测试未发布配置', { timeout: 40000 })
      await testModel.getByRole('button', { name: '移除模型', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '从草稿移除', exact: true }).click()
      await page.getByRole('button', { name: '发布配置', exact: true }).click()
      await expect(page.getByRole('status')).toContainText('已发布')
    }
    await page.getByRole('button', { name: '添加回答模型服务', exact: true }).click()
    const newProvider = page.getByRole('group', { name: /^服务配置 service-/ }).last()
    await newProvider.getByLabel('服务名称', { exact: true }).fill('可移除的管理验证服务')
    const providerFields = page.getByRole('group', { name: '服务配置 可移除的管理验证服务', exact: true })
    await providerFields.getByLabel('启用服务', { exact: true }).uncheck()
    await providerFields.getByLabel('请求地址', { exact: true }).fill('http://127.0.0.1:9/chat/completions')
    await page.getByRole('button', { name: '发布配置', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('已发布')
    await providerFields.getByRole('button', { name: '移除服务', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '从草稿移除', exact: true }).click()
    await page.getByRole('button', { name: '发布配置', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('已发布')
    const concurrentlyChanged = await api('/admin/config')
    await api('/admin/config', 'PUT', configBody(concurrentlyChanged))
    const conflict = page.waitForResponse(response => response.url().endsWith('/api/v1/admin/config') && response.request().method() === 'PUT')
    await page.getByRole('button', { name: '发布配置', exact: true }).click()
    expect((await conflict).status()).toBe(409)
    await expect(page.getByRole('alert')).toContainText('重新加载后再保存')
    await page.getByRole('button', { name: '重新加载配置', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '丢弃草稿并重新加载', exact: true }).click()
    await expect(page.getByRole('heading', { name: '模型与服务', exact: true })).toBeVisible()
    passed.push('服务创建移除与并发版本冲突')
    for (const [capability, label] of [['asr', '测试转写服务'], ['knowledge', '测试知识库服务']]) {
      if (!initialConfig[capability].enabled) continue
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(page.getByRole('status')).toContainText('测试未发布配置', { timeout: 40000 })
    }
    passed.push('配置发布、模型创建移除及已启用服务草稿测试')
    await page.screenshot({ path: resolve(output, 'configuration.png'), fullPage: true })

    await page.getByRole('button', { name: '调用记录', exact: true }).click()
    await page.getByLabel('用户 ID', { exact: true }).fill(createdUserId)
    await page.getByRole('button', { name: '筛选记录', exact: true }).click()
    await expect(page.getByText('没有匹配的调用记录。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '操作日志', exact: true }).click()
    await expect(page.getByRole('table', { name: '操作日志列表', exact: true })).toBeVisible()
    passed.push('调用记录筛选与操作日志')
    await page.screenshot({ path: resolve(output, 'audit.png'), fullPage: true })

    const current = await api('/admin/config')
    await api('/admin/config', 'PUT', { ...configBody(initialConfig), version: current.version })
    initialConfig = undefined
    if (createdUserId) await api(`/admin/users/${createdUserId}`, 'PUT', { enabled: false, dailyAnswers: 0, dailyKnowledgeQueries: 0 })
    createdUserId = undefined
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page.getByRole('heading', { name: '登录管理后台', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: '登录管理后台', exact: true })).toBeVisible()
    passed.push('退出与刷新不保留凭证')
    expect(errors).toEqual([])
    const report = { passed, pageErrors: errors, testUsername }
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
    return report
  } catch (error) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => undefined)
    throw error
  } finally {
    if (token) {
      try { if (initialConfig) { const current = await api('/admin/config'); await api('/admin/config', 'PUT', { ...configBody(initialConfig), version: current.version }) } } catch { /* Report the original failure; isolated backend owns cleanup. */ }
      try { if (createdUserId) await api(`/admin/users/${createdUserId}`, 'PUT', { enabled: false, dailyAnswers: 0, dailyKnowledgeQueries: 0 }) } catch { /* Same isolated-fixture cleanup. */ }
    }
    await browser.close()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await runAdminSmoke({ baseUrl: process.env.COPILOT_ADMIN_URL, username: process.env.COPILOT_ADMIN_USERNAME, password: process.env.COPILOT_ADMIN_PASSWORD, output: process.env.COPILOT_ADMIN_SMOKE_OUTPUT || 'test-results/smoke' })
  process.stdout.write(`${report.passed.length} 项管理端浏览器验证通过。\n`)
}
