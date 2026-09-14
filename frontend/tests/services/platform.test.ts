import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'
import { AsrClient } from '../../src/main/services/asr-client'
import { defaultSettings } from '../../src/shared/defaults'
import type { AppEvent, PlatformInfo, Settings, SettingsInput } from '../../src/shared/types'
import { SettingsStore, type ServiceSecrets } from '../../src/main/services/settings-store'
import { PlatformClient, PlatformService } from '../../src/main/services/platform-client'
import { needsPlatform, routeService } from '../../src/main/services/service-routing'
import { AccountWorkspaces } from '../../src/main/services/account-workspace'
import { LlmClient } from '../../src/main/services/llm-client'
import { RemoteKnowledgeClient } from '../../src/main/services/remote-knowledge-client'

const info: PlatformInfo = { advancedSettingsEnabled: true, user: { id: 'user-1', displayName: 'demo' }, capabilities: { llm: true, asr: true, knowledge: true }, models: { llm: 'server-model', asr: 'server-asr' }, limits: { maxAsrSessionSeconds: 3600 } }
const expiresAt = () => new Date(Date.now() + 3_600_000).toISOString()
const crypto = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')), decryptString: (value: Buffer) => value.toString().split('').reverse().join('') }
const enabledInput = (): SettingsInput => ({ ...structuredClone(defaultSettings), platform: { enabled: true, baseUrl: 'http://127.0.0.1:8080' } })
const secrets: ServiceSecrets = { platformAccessToken: 'business-token', llmApiKey: '', asrApiKey: '', remoteKnowledgeApiKey: '' }
const authenticatedSettings = (): Settings => ({ ...structuredClone(defaultSettings), platform: { ...structuredClone(info), enabled: true, baseUrl: 'https://platform.example', authenticated: true, expiresAt: expiresAt() } })
let directory: string
let store: SettingsStore
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'copilot-platform-')); store = new SettingsStore(directory, crypto) })
afterEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

describe('platform credentials and sessions', () => {
  it('encrypts remembered credentials and preserves them across settings saves and restarts', async () => {
    const credentials = { identifier: 'remember@example.test', password: 'remember-secret-password' }
    await store.saveSettings(enabledInput())
    await store.saveRememberedLogin(credentials)
    await store.saveSettings(enabledInput())
    const contents = await readFile(join(directory, 'settings.json'), 'utf8')
    expect(contents).not.toContain(credentials.password)
    expect(contents).not.toContain(credentials.identifier)
    const restarted = new SettingsStore(directory, crypto)
    expect(await restarted.getRememberedLogin()).toEqual(credentials)
    await restarted.clearPlatformSession()
    expect(await restarted.getRememberedLogin()).toEqual(credentials)
    await restarted.saveRememberedLogin(null)
    expect(await new SettingsStore(directory, crypto).getRememberedLogin()).toBeNull()
  })
  it.each([
    ['emailCode', { email: 'test@example.com' }, '验证码发送过于频繁'],
    ['register', { email: 'test@example.com', password: 'test-password-123', code: '123456' }, '注册尝试过于频繁'],
    ['login', { identifier: 'test@example.com', password: 'test-password-123' }, '登录尝试过于频繁'],
  ] as const)('reports %s throttling without claiming model quota exhaustion', async (method, input, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'private upstream detail' }, { status: 429 })))
    const client = new PlatformClient('https://platform.example')
    await expect(client[method](input)).rejects.toThrow(message)
  })

  it('uses distinct recovery endpoints without saving secrets or creating a session', async () => {
    await store.saveSettings(enabledInput())
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ retryAfterSeconds: 60, expiresInSeconds: 600 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new PlatformService(store)
    await service.passwordResetCode({ email: 'Existing@Example.com' })
    await service.resetPassword({ email: 'Existing@Example.com', password: 'new-secret-password', code: '654321' })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['http://127.0.0.1:8080/api/v1/auth/password-reset/email-code', 'http://127.0.0.1:8080/api/v1/auth/password-reset'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: 'existing@example.com', password: 'new-secret-password', code: '654321' })
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('Authorization')
    expect((await store.getSettings()).platform?.authenticated).toBe(false)
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toMatch(/new-secret-password|654321/)
    await expect(service.resetPassword({ email: 'existing@example.com', password: 'short', code: '654321' })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each([
    ['emailCode', { email: 'test@example.com' }, 409, '该邮箱已注册，如果该邮箱为您的邮箱，可以直接登录或找回密码。'],
    ['resetPassword', { email: 'test@example.com', password: 'test-password-123', code: '123456' }, 400, '密码修改失败'],
    ['passwordResetCode', { email: 'test@example.com' }, 404, '该邮箱尚未注册'],
  ] as const)('reports actionable %s errors', async (method, input, status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private body', { status })))
    await expect(new PlatformClient('https://platform.example')[method](input)).rejects.toThrow(message)
  })
  it('persists the selected platform model across restart and capability refresh, clearing it on server change', async () => {
    const platform = { enabled: true, baseUrl: defaultSettings.platform!.baseUrl, selectedModelId: 'careful' }
    await store.saveSettings({ ...enabledInput(), platform })
    await store.savePlatformSession(platform.baseUrl, 'business-token', expiresAt(), {
      ...info, models: { ...info.models, available: [{ id: 'server-model', name: '快速回答' }, { id: 'careful', name: '深度回答' }] },
    })
    const restarted = new SettingsStore(directory, crypto)
    expect((await restarted.getSettings()).platform?.selectedModelId).toBe('careful')
    await restarted.savePlatformSession(platform.baseUrl, 'business-token', expiresAt(), info, 'business-token')
    expect((await restarted.getSettings()).platform?.selectedModelId).toBe('careful')
    await restarted.saveSettings({ ...enabledInput(), platform: { ...platform, baseUrl: 'https://new.example' } })
    expect((await restarted.getSettings()).platform?.selectedModelId).toBeUndefined()
  })
  it('validates the published catalog and strips provider fields from its entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ ...info,
      models: { ...info.models, available: [{ id: 'server-model', name: '快速回答', apiKey: 'must-not-persist', url: 'https://provider.example' }] },
    })).mockResolvedValueOnce(Response.json({ ...info,
      models: { ...info.models, available: [{ id: 'duplicate', name: 'A' }, { id: 'duplicate', name: 'B' }] },
    })).mockResolvedValueOnce(Response.json({ ...info, models: { ...info.models, available: [] } })))
    const client = new PlatformClient('https://platform.example')
    expect((await client.info('business-token')).models.available).toEqual([{ id: 'server-model', name: '快速回答' }])
    await expect(client.info('business-token')).rejects.toThrow('能力响应格式无效')
    await expect(client.info('business-token')).rejects.toThrow('能力响应格式无效')
  })
  it('migrates old settings read-only with platform disabled', async () => {
    const { platform: _platform, ...legacy } = structuredClone(defaultSettings)
    const raw = JSON.stringify({ version: 1, settings: legacy, secrets: { asr: '', llm: '', remoteKnowledge: '' } })
    await writeFile(join(directory, 'settings.json'), raw)
    expect((await store.getSettings()).platform).toEqual(defaultSettings.platform)
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe(raw)
  })
  it('encrypts the business token and preserves login across restarts without exposing tokens or provider fields', async () => {
    await store.saveSettings(enabledInput())
    const visible = await store.savePlatformSession('http://127.0.0.1:8080', secrets.platformAccessToken, expiresAt(), info)
    expect(visible.platform).toMatchObject({ authenticated: true, user: info.user })
    expect(JSON.stringify(visible)).not.toContain('business-token')
    expect(JSON.stringify(visible)).not.toContain('accessToken')
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('business-token')
    const restarted = new SettingsStore(directory, crypto)
    expect((await restarted.getSettings()).platform?.authenticated).toBe(true)
    expect((await restarted.getSecrets()).platformAccessToken).toBe('business-token')
  })
  it('clears login when base URL changes and refuses stale refreshes or logins', async () => {
    await store.saveSettings(enabledInput())
    await store.savePlatformSession('http://127.0.0.1:8080', 'old-token', expiresAt(), info)
    await store.saveSettings({ ...enabledInput(), platform: { enabled: true, baseUrl: 'https://another.example' } })
    expect((await store.getSettings()).platform?.authenticated).toBe(false)
    expect((await store.getSecrets()).platformAccessToken).toBe('')
    await expect(store.savePlatformSession('http://127.0.0.1:8080', 'old-token', expiresAt(), info)).rejects.toThrow('设置已改变')
    await store.savePlatformSession('https://another.example', 'new-token', expiresAt(), info)
    await expect(store.savePlatformSession('https://another.example', 'old-token', expiresAt(), info, 'old-token')).rejects.toThrow('登录已改变')
    await store.clearPlatformSession('old-token')
    expect((await store.getSecrets()).platformAccessToken).toBe('new-token')
  })
  it('allows keyless platform knowledge but still validates any saved BYOK configuration', async () => {
    await store.saveSettings({ ...enabledInput(), remoteKnowledge: { enabled: true, url: '', agentId: '' } })
    await store.saveSettings({ ...enabledInput(), remoteKnowledge: { enabled: true, url: 'https://knowledge.example/search', agentId: 'aid', apiKey: 'own-key' } })
    await expect(store.saveSettings({ ...enabledInput(), remoteKnowledge: { enabled: true, url: '', agentId: '' } })).rejects.toThrow('请求地址')
    await store.saveSettings({ ...enabledInput(), remoteKnowledge: { enabled: true, url: '', agentId: '', apiKey: '' } })
    expect((await store.getSecrets()).remoteKnowledgeApiKey).toBe('')
  })
  it('rejects business credentials when secure storage is unavailable', async () => {
    const unsafe = new SettingsStore(directory, { ...crypto, isEncryptionAvailable: () => false })
    await unsafe.saveSettings(enabledInput())
    await expect(unsafe.savePlatformSession('http://127.0.0.1:8080', 'business-token', expiresAt(), info)).rejects.toThrow('系统安全存储不可用')
    expect((await unsafe.getSettings()).platform?.authenticated).toBe(false)
  })
  it('logs in with credentials once, fetches capabilities with only the business token, and never persists a password', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ accessToken: 'business-token', expiresAt: expiresAt(), user: info.user }))
      .mockResolvedValueOnce(Response.json({ ...info, providerApiKey: 'must-be-stripped' }))
    vi.stubGlobal('fetch', fetchMock)
    await store.saveSettings(enabledInput())
    const visible = await new PlatformService(store).login({ identifier: 'demo', password: 'password-never-persist' })
    expect(fetchMock.mock.calls[0]).toEqual(['http://127.0.0.1:8080/api/v1/auth/login', expect.objectContaining({ body: JSON.stringify({ identifier: 'demo', password: 'password-never-persist', clientType: 'desktop' }), redirect: 'error' })])
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer business-token')
    const stored = await readFile(join(directory, 'settings.json'), 'utf8')
    expect(stored).not.toContain('password-never-persist')
    expect(stored).not.toContain('must-be-stripped')
    expect(visible.platform?.models.llm).toBe('server-model')
  })
  it('clears locally even when logout cannot reach the backend', async () => {
    await store.saveSettings(enabledInput())
    await store.savePlatformSession('http://127.0.0.1:8080', 'business-token', expiresAt(), info)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    expect((await new PlatformService(store).logout()).platform?.authenticated).toBe(false)
    expect((await store.getSecrets()).platformAccessToken).toBe('')
  })
  it('reports invalid authentication for the main-process draft and sign-out coordinator', async () => {
    await store.saveSettings(enabledInput())
    await store.savePlatformSession('http://127.0.0.1:8080', 'business-token', expiresAt(), info)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-error-body', { status: 401 })))
    await expect(new PlatformService(store).refresh()).rejects.toThrow('登录已失效')
    // Credential cleanup waits for the main-process draft handshake.
    expect((await store.getSettings()).platform?.authenticated).toBe(true)
  })
  it.each(['http://127.0.0.1:8080', 'https://platform.example'])('accepts loopback HTTP and remote HTTPS at %s', async baseUrl => {
    await store.saveSettings({ ...enabledInput(), platform: { enabled: true, baseUrl } })
    expect((await store.getSettings()).platform?.baseUrl).toBe(baseUrl)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(info), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await new PlatformClient(baseUrl).info('synthetic-token')
    expect(fetchMock).toHaveBeenCalledWith(baseUrl + '/api/v1/platform', expect.anything())
  })

  it.each(['ftp://remote.example', 'https://user:secret@remote.example', 'https://remote.example?q=token', 'file:///tmp'])('rejects unsafe platform base URL %s', baseUrl => {
    expect(() => new PlatformClient(baseUrl)).toThrow()
  })
  it('times out an unavailable platform and propagates cancellation without consuming provider services', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    })))
    await expect(new PlatformClient('https://platform.example', 15).info('business-token')).rejects.toThrow('连接超时')
    const controller = new AbortController()
    const pending = new PlatformClient('https://platform.example').info('business-token', controller.signal)
    controller.abort(new Error('用户取消'))
    await expect(pending).rejects.toThrow('用户取消')
  })
  it('bounds responses and rejects enabled capabilities with missing model IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('x'.repeat(65_537))).mockResolvedValueOnce(Response.json({ ...info, models: { llm: '', asr: 'asr' } })))
    const client = new PlatformClient('https://platform.example')
    await expect(client.info('business-token')).rejects.toThrow('容量限制')
    await expect(client.info('business-token')).rejects.toThrow('能力响应格式无效')
  })
})

describe('capability routing', () => {
  it('routes the user-selected catalog ID and rejects a removed selection without changing models', () => {
    const settings = authenticatedSettings()
    if (!settings.platform) throw new Error('fixture')
    settings.platform.models.available = [{ id: 'server-model', name: '快速回答' }, { id: 'careful', name: '深度回答' }]
    settings.platform.selectedModelId = 'careful'
    expect(routeService(settings, secrets, 'llm').settings.llm.model).toBe('careful')
    settings.platform.models.available = [{ id: 'server-model', name: '快速回答' }]
    expect(() => routeService(settings, secrets, 'llm')).toThrow('重新选择')
    expect(routeService(settings, { ...secrets, llmApiKey: 'own-key' }, 'llm').settings.llm.model).toBe(settings.llm.model)
    settings.platform.selectedModelId = ''
    expect(routeService(settings, secrets, 'llm').settings.llm.model).toBe('server-model')
  })
  it.each(['llm', 'asr', 'knowledge'] as const)('routes %s with own key directly and never substitutes the business token', capability => {
    const settings = authenticatedSettings()
    const supplied = { ...secrets, llmApiKey: 'invalid-own-llm', asrApiKey: 'invalid-own-asr', remoteKnowledgeApiKey: 'invalid-own-knowledge' }
    expect(needsPlatform(settings, supplied, capability)).toBe(false)
    expect(routeService(settings, supplied, capability).apiKey).toBe(`invalid-own-${capability}`)
    expect(routeService(settings, supplied, capability).settings).toBe(settings)
  })
  it('keeps a keyless local LLM direct while other capabilities use the platform', () => {
    const settings = authenticatedSettings()
    settings.llm.baseUrl = 'http://localhost:11434/v1'
    expect(routeService(settings, secrets, 'llm')).toEqual({ settings, apiKey: '' })
    expect(needsPlatform(settings, secrets, 'asr')).toBe(true)
    expect(needsPlatform({ ...settings, platform: undefined }, secrets, 'asr')).toBe(false)
  })
  it('maps platform endpoint and actual model independently for all three capabilities', () => {
    const settings = authenticatedSettings()
    expect(routeService(settings, secrets, 'llm')).toMatchObject({ apiKey: 'business-token', settings: { llm: { baseUrl: 'https://platform.example/api/v1/llm', model: 'server-model' } } })
    expect(routeService(settings, secrets, 'asr')).toMatchObject({ apiKey: 'business-token', settings: { asr: { url: 'wss://platform.example/api/v1/asr', model: 'server-asr' } } })
    expect(routeService(settings, secrets, 'knowledge')).toMatchObject({ apiKey: 'business-token', settings: { remoteKnowledge: { url: 'https://platform.example/api/v1/knowledge/search', agentId: 'platform' } } })
  })
  it('reports unauthenticated, expired, and missing capabilities explicitly', () => {
    const settings = authenticatedSettings()
    if (!settings.platform) throw new Error('fixture')
    settings.platform.capabilities.knowledge = false
    expect(() => routeService(settings, secrets, 'knowledge')).toThrow('尚未启用远程知识库')
    settings.platform.expiresAt = '2000-01-01T00:00:00.000Z'
    expect(() => routeService(settings, secrets, 'llm')).toThrow('登录平台账号')
    settings.platform.authenticated = false
    expect(() => routeService(settings, secrets, 'asr')).toThrow('登录平台账号')
  })
  it('sends the business bearer and server model over platform ASR WebSocket with PCM and finalization', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (typeof address === 'string' || !address) throw new Error('Missing address')
    const settings = authenticatedSettings()
    if (!settings.platform) throw new Error('fixture')
    settings.platform.baseUrl = `http://127.0.0.1:${address.port}`
    let header: string | undefined
    let path: string | undefined
    let model: string | undefined
    const audio: Buffer[] = []
    server.on('connection', (socket, request) => {
      header = request.headers.authorization; path = request.url
      socket.on('message', (raw, binary) => {
        if (binary) { audio.push(Buffer.from(raw as Buffer)); return }
        const frame = JSON.parse(raw.toString()) as { header: { action: string; task_id: string }; payload: { model?: string } }
        if (frame.header.action === 'run-task') model = frame.payload.model
        socket.send(JSON.stringify({ header: { task_id: frame.header.task_id, event: frame.header.action === 'run-task' ? 'task-started' : 'task-finished' } }))
      })
    })
    const connection = routeService(settings, secrets, 'asr')
    const client = new AsrClient(connection.settings.asr, connection.apiKey, () => undefined)
    try {
      const { sessionId } = await client.start()
      client.sendAudio(sessionId, new Uint8Array([0, 1, 0, 2]).buffer)
      await client.stop()
      expect(header).toBe('Bearer business-token')
      expect(path).toBe('/api/v1/asr')
      expect(model).toBe('server-asr')
      expect(Buffer.concat(audio)).toEqual(Buffer.from([0, 1, 0, 2]))
    } finally {
      client.dispose()
      for (const socket of server.clients) socket.terminate()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
  it('leaves BYOK request headers unchanged and never retries invalid keys on the platform', async () => {
    const settings = authenticatedSettings()
    const connection = routeService(settings, { ...secrets, llmApiKey: 'bad-own-key' }, 'llm')
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new LlmClient(connection.settings, connection.apiKey, () => undefined, connection.platform).generate({ requestId: 'own-request', question: '问题', transcript: '' })).rejects.toThrow('HTTP 401')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer bad-own-key' })
  })
  it('uses only the business token in real client requests and snapshots the actual server model', async () => {
    const settings = authenticatedSettings()
    settings.remoteKnowledge.enabled = true
    const remote = routeService(settings, secrets, 'knowledge')
    const model = routeService(settings, secrets, 'llm')
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ success: true, data: { nodes: [{ text: '正文', metadata: { private: 'ignore' } }] } }))
      .mockResolvedValueOnce(new Response('data: {"choices":[{"delta":{"content":"我会结合正文回答。"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    const retrieved = await new RemoteKnowledgeClient(remote.settings.remoteKnowledge, remote.apiKey).retrieve('问题', new AbortController().signal)
    const events: AppEvent[] = []
    await new LlmClient(model.settings, model.apiKey, event => events.push(event), model.platform).generate({ requestId: 'request', question: '问题', transcript: '' }, retrieved)
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['https://platform.example/api/v1/knowledge/search', 'https://platform.example/api/v1/llm/chat/completions'])
    for (const call of fetchMock.mock.calls) expect(call[1].headers.Authorization).toBe('Bearer business-token')
    expect(fetchMock.mock.calls[1][1].headers['X-Request-Id']).toBe('request')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('requestId')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ agent_id: 'platform', query: '问题', images: [] })
    expect(events.find(event => event.kind === 'answer-request')).toMatchObject({ modelInput: { model: 'server-model' } })
    expect(JSON.stringify(events)).not.toContain('business-token')
    expect(JSON.stringify(events)).not.toContain('metadata')
    expect(events.at(-1)).toMatchObject({ kind: 'answer-done', cancelled: false })
  })
})

 it('explains invalid invitation codes without exposing provider error messages', async () => {
   vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'invalid_invitation_code', message: 'private server detail' }, { status: 400 })))
   await expect(new PlatformClient('https://platform.example').register({ email: 'alice@example.com', password: 'safe-password-123', code: '123456', invitationCode: 'ABC234' })).rejects.toThrow('邀请码无效或邀请人已停用')
 })
