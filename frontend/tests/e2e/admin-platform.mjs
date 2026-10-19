import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

/** Runs only against the isolated SQL database and loopback providers owned by smoke-platform. */
export async function runAdminPlatformChecks({ baseUrl, password, keys, page, mock, answer, begin, until, check, noSecrets }) {
  async function request(path, method = 'GET', body, token = adminToken) {
    return fetch(`${baseUrl}/api/v1/${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) })
  }
  let adminToken
  const login = await request('auth/login', 'POST', { identifier: 'admin-test', password, clientType: 'admin' })
  assert.equal(login.status, 200)
  adminToken = (await login.json()).accessToken
  const administrator = await (await request('admin/me')).json()
  const adminWallet = await (await request(`admin/users/${administrator.id}/wallet`)).json()
  assert.equal((await request(`admin/users/${administrator.id}/wallet/adjust`, 'POST', {
    requestId: crypto.randomUUID(), operation: 'add', seconds: 3600, expectedVersion: adminWallet.version, reason: 'isolated admin provider verification',
  })).status, 200)
  const start = await request('interview-sessions/start', 'POST', { requestId: crypto.randomUUID() })
  assert.equal(start.status, 200)
  const adminSession = (await start.json()).session.id
  const heartbeat = setInterval(() => void request(`interview-sessions/${adminSession}/heartbeat`, 'POST', {}).catch(() => undefined), 10000)
  try {
  let config = await (await request('admin/config')).json()

  await check('admin APIs require administrator authority and configuration never returns a supplier secret', async () => {
    const ordinary = await request('auth/login', 'POST', { identifier: 'platform-test', password, clientType: 'desktop' })
    const token = (await ordinary.json()).accessToken
    for (const path of ['admin/me', 'admin/users', 'admin/config', 'admin/usage', 'admin/audit']) {
      assert.equal((await request(path, 'GET', undefined, token)).status, 403, path)
    }
    const me = await (await request('admin/me')).json()
    assert.equal(me.role, 'ADMIN')
    noSecrets(config)
    assert.equal(JSON.stringify(config).includes('"apiKey"'), false)
  })

  const draft = {
    version: config.version,
    providers: [
      { id: 'answer-supplier', name: '本机回答供应商', kind: 'llm', url: `${mock.llmBaseUrl}/chat/completions`, enabled: true, apiKey: keys.llm },
      { id: 'asr-supplier', name: '本机转写供应商', kind: 'asr', url: `${mock.asrUrl}?mode=manual`, enabled: true, apiKey: keys.asr },
    ],
    models: [
      { id: 'answer-fast', name: '快速回答', providerId: 'answer-supplier', model: 'mock-fast', enabled: true, maxOutputTokens: 1024 },
      { id: 'answer-careful', name: '深度回答', providerId: 'answer-supplier', model: 'mock-second', enabled: true, maxOutputTokens: 2048 },
      { id: 'answer-held', name: '持续输出', providerId: 'answer-supplier', model: 'mock-held', enabled: true, maxOutputTokens: 1024 },
    ],
    defaultModelId: 'answer-fast',
    asr: { enabled: true, providerId: 'asr-supplier', model: 'fun-asr-realtime' },
  }

  await check('both draft connection tests reach their protocol without publishing configuration', async () => {
    for (const capability of ['llm', 'asr']) {
      const response = await request('admin/config/test', 'POST', { config: draft, capability, modelId: 'answer-fast' })
      assert.equal(response.status, 200, capability)
      const result = await response.json()
      assert.equal(result.success, true, `${capability}: ${result.message}`)
      noSecrets(result)
    }
    assert.equal((await (await request('admin/config')).json()).version, config.version)
    const failedDraft = structuredClone(draft)
    failedDraft.models[0].model = 'mock-error'
    const response = await request('admin/config/test', 'POST', { config: failedDraft, capability: 'llm', modelId: 'answer-fast' })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).success, false)
    assert.equal((await (await request('admin/config')).json()).version, config.version)
  })

  async function publish(next) {
    const response = await request('admin/config', 'PUT', next)
    assert.equal(response.status, 200, await response.clone().text())
    const saved = await response.json()
    assert.equal(saved.version, next.version + 1)
    noSecrets(saved)
    assert.equal(JSON.stringify(saved).includes('"apiKey"'), false)
    config = saved
  }

  await check('publishing updates public catalog and stale saves cannot overwrite newer configuration', async () => {
    await publish(draft)
    assert.equal((await request('admin/config', 'PUT', draft)).status, 409)
    const info = await (await request('platform')).json()
    assert.equal(info.models.llm, 'answer-fast')
    assert.deepEqual(info.models.available.map(model => model.id), ['answer-fast', 'answer-careful', 'answer-held'])
    assert.equal(JSON.stringify(info).includes(mock.llmBaseUrl), false)
    noSecrets(info)
  })

  await check('Electron selects a published display name and backend maps catalog ID to supplier model', async () => {
    await page.evaluate(() => window.copilot.refreshPlatform())
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    // AppSelect 非 native select:点开触发器后点击门户内选项(下同)。
    await page.getByRole('combobox', { name: /^回答模型/ }).click()
    await page.getByRole('option', { name: '深度回答', exact: true }).click()
    await page.getByRole('combobox', { name: /^实时语音转写/ }).click()
    await page.getByRole('option', { name: '本机转写供应商', exact: true }).click()
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '设置已保存' })).toBeVisible()
    await page.getByRole('button', { name: '关闭设置', exact: true }).click()
    const events = await answer('选择平台列表中的深度回答模型。')
    assert.equal(mock.requests.at(-1).body.model, 'mock-second')
    assert.equal(mock.requests.at(-1).authorization, `Bearer ${keys.llm}`)
    assert.equal(events.find(event => event.kind === 'answer-request').modelInput.model, 'answer-careful')
    assert.equal((await page.evaluate(() => window.copilot.getSettings())).serviceSelections.llm.id, 'answer-careful')
  })

  await check('publishing during a streamed answer preserves the running request snapshot', async () => {
    const response = await request('llm/chat/completions', 'POST', {
      model: 'answer-held', messages: [{ role: 'user', content: 'stream snapshot' }], stream: true,
    })
    assert.equal(response.status, 200)
    const reader = response.body.getReader()
    assert.equal((await reader.read()).done, false)
    const index = mock.requests.length - 1
    await until(() => mock.isStreamHeld(index), 'Fake stream did not wait for publication')
    await publish({ ...config, models: config.models.map(model => model.id === 'answer-held' ? { ...model, model: 'mock-second' } : model) })
    assert.equal(mock.requests[index].cancelled, false)
    assert.equal(mock.requests[index].body.model, 'mock-held')
    mock.finishStream(index)
    let text = ''
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value) }
    assert.ok(text.includes('[DONE]'))
    const next = await request('llm/chat/completions', 'POST', {
      model: 'answer-held', messages: [{ role: 'user', content: 'new snapshot' }], stream: false,
    })
    assert.equal(next.status, 200)
    await next.text()
    assert.equal(mock.requests.at(-1).body.model, 'mock-second')
  })

  await check('active ASR survives publication while the next ASR session uses the new model', async () => {
    await begin()
    const { sessionId } = await page.evaluate(() => window.copilot.startAsr())
    await until(() => mock.asrConnections.at(-1)?.commands.some(command => command.header.action === 'run-task'), 'ASR did not start')
    const active = mock.asrConnections.at(-1)
    const initialModel = config.asr.model
    await publish({ ...config, asr: { ...config.asr, model: 'fun-asr-next' } })
    assert.equal(active.closed, false)
    await page.evaluate(id => window.copilot.sendAudio(id, new Uint8Array([1, 0, 2, 0]).buffer), sessionId)
    await until(() => active.audioBytes === 4, 'Publication interrupted PCM delivery')
    assert.equal(active.commands.find(command => command.header.action === 'run-task').payload.model, initialModel)
    await page.evaluate(() => window.copilot.stopAsr())
    await page.evaluate(() => window.copilot.startAsr())
    assert.equal(mock.asrConnections.at(-1).commands.find(command => command.header.action === 'run-task').payload.model, 'fun-asr-next')
    await page.evaluate(() => window.copilot.stopAsr())
    await publish({ ...config, asr: { ...config.asr, model: initialModel } })
  })

  await check('removing an offered model rejects new calls and requires an explicit desktop selection', async () => {
    await publish({ ...config, models: config.models.map(model => model.id === 'answer-careful' ? { ...model, enabled: false } : model) })
    const before = mock.requests.length
    const denied = await request('llm/chat/completions', 'POST', {
      model: 'answer-careful', messages: [{ role: 'user', content: 'removed model' }], stream: false,
    })
    assert.equal(denied.status, 400)
    await page.evaluate(() => window.copilot.refreshPlatform())
    await assert.rejects(page.evaluate(() => window.copilot.testModel()), /重新选择/)
    assert.equal(mock.requests.length, before)
    await page.evaluate(async () => {
      const settings = await window.copilot.getSettings()
      await window.copilot.saveSettings({ ...settings, serviceSelections: { ...settings.serviceSelections, llm: { source: 'platform', id: settings.platform.models.llm } } })
    })
    await answer('显式重新选择平台默认模型。')
    assert.equal(mock.requests.at(-1).body.model, 'mock-fast')
  })

  await check('user creation, time adjustments, password reset and disabling take effect through server authorization', async () => {
    const created = await request('admin/users', 'POST', { identifier: 'managed-test', password, availableSeconds: 0 })
    assert.equal(created.status, 201)
    const user = await created.json()
    assert.equal(user.role, 'USER')
    const loginUser = await request('auth/login', 'POST', { identifier: 'managed-test', password, clientType: 'desktop' })
    const token = (await loginUser.json()).accessToken
    const completion = { model: 'answer-fast', messages: [{ role: 'user', content: 'metered answer' }], stream: false }
    const noTime = await request('interview-sessions/start', 'POST', { requestId: crypto.randomUUID() }, token)
    assert.equal(noTime.ok, false)
    const edited = await request(`admin/users/${user.id}/wallet/adjust`, 'POST', { requestId: crypto.randomUUID(), operation: 'add', seconds: 120, expectedVersion: user.walletVersion, reason: 'isolated smoke test' })
    assert.equal(edited.status, 200)
    assert.equal((await request('interview-sessions/start', 'POST', { requestId: crypto.randomUUID() }, token)).status, 200)
    assert.equal((await request('llm/chat/completions', 'POST', completion, token)).status, 200)
    assert.equal((await request(`admin/users/${user.id}/password`, 'POST', { password: `${password.slice(0, 30)}changed`, clientType: 'desktop' })).status, 204)
    assert.equal((await request('platform', 'GET', undefined, token)).status, 401)
    const newLogin = await request('auth/login', 'POST', { identifier: 'managed-test', password: `${password.slice(0, 30)}changed`, clientType: 'desktop' })
    const newToken = (await newLogin.json()).accessToken
    assert.equal((await request(`admin/users/${user.id}`, 'PUT', { enabled: false })).status, 200)
    assert.equal((await request('platform', 'GET', undefined, newToken)).status, 401)
  })

  await check('usage and audit record operational metadata without question bodies or credentials', async () => {
    const usage = await (await request('admin/usage?capability=llm&model=mock-second')).json()
    assert.ok(usage.items.length > 0)
    assert.ok(usage.items.every(item => item.capability === 'llm' && item.model === 'mock-second'))
    const audit = await (await request('admin/audit')).json()
    assert.ok(audit.items.length > 0)
    noSecrets({ usage, audit })
    const serialized = JSON.stringify({ usage, audit })
    assert.equal(serialized.includes(password), false)
    assert.equal(serialized.includes('选择平台列表中的深度回答模型'), false)
  })
  await check('ending the interview cancels an already streaming server answer', async () => {
    await publish({ ...config, models: config.models.map(model => model.id === 'answer-held' ? { ...model, model: 'mock-held' } : model) })
    const response = await request('llm/chat/completions', 'POST', {
      model: 'answer-held', messages: [{ role: 'user', content: 'cancel on interview end' }], stream: true,
    })
    assert.equal(response.status, 200)
    const reader = response.body.getReader()
    assert.equal((await reader.read()).done, false)
    const index = mock.requests.length - 1
    await until(() => mock.isStreamHeld(index), 'Stream did not wait')
    assert.equal((await request(`interview-sessions/${adminSession}/end`, 'POST', {})).status, 200)
    await until(() => mock.requests[index].cancelled, 'End interview did not close upstream answer', 5000)
    await reader.cancel()
  })
  } finally {
    clearInterval(heartbeat)
    await request(`interview-sessions/${adminSession}/end`, 'POST', {}).catch(() => undefined)
    await request('auth/logout', 'POST', {}).catch(() => undefined)
  }
}
