import { z } from 'zod'
import { operationHeaders } from './operations-telemetry'
import { invitationErrors } from '../../shared/invitation'
import { assertPlatformTransport } from '../../shared/platform-transport'
import { sessionFault, SessionFault } from './session-fault'
import type { PlatformInfo, Settings } from '../../shared/types'
import { emailCodeResponseSchema, emailInputSchema, platformInfoSchema, platformLoginInputSchema, platformLoginResponseSchema, registerInputSchema, passwordResetInputSchema } from './platform-schema'
import { parseInput, platformSettingsSchema } from './validation'
import type { ServiceSecrets, SettingsStore } from './settings-store'

export class PlatformRequestError extends Error { constructor(message: string, readonly status?: number) { super(message) } }
const MAX_BYTES = 65_536
export class PlatformClient {
  readonly baseUrl: string
  constructor(baseUrl: string, private readonly timeoutMs = 8000) {
    assertPlatformTransport(baseUrl)
    this.baseUrl = parseInput(platformSettingsSchema, { enabled: true, baseUrl }).baseUrl
  }
  async login(input: unknown) {
    const credentials = parseInput(platformLoginInputSchema, input)
    const raw = await this.request('/api/v1/auth/login', undefined, { ...credentials, clientType: 'desktop' })
    const parsed = platformLoginResponseSchema.safeParse(raw)
    if (!parsed.success) throw new Error('平台登录响应格式无效。')
    if (Date.parse(parsed.data.expiresAt) <= Date.now()) throw new Error('平台登录已过期，请重新登录。')
    return parsed.data
  }
  async register(input: unknown) {
    const raw = await this.request('/api/v1/auth/register', undefined, parseInput(registerInputSchema, input))
    return parseInput(platformLoginResponseSchema, raw)
  }
  async emailCode(input: unknown) {
    const raw = await this.request('/api/v1/auth/email-code', undefined, parseInput(emailInputSchema, input))
    return parseInput(emailCodeResponseSchema, raw)
  }
  async passwordResetCode(input: unknown) {
    const raw = await this.request('/api/v1/auth/password-reset/email-code', undefined, parseInput(emailInputSchema, input))
    return parseInput(emailCodeResponseSchema, raw)
  }
  async resetPassword(input: unknown): Promise<void> {
    await this.request('/api/v1/auth/password-reset', undefined, parseInput(passwordResetInputSchema, input))
  }
  async invitationRequest(path: string, token?: string, body?: unknown) { return this.request(path, token, body) }
  async info(token: string, signal?: AbortSignal): Promise<PlatformInfo> {
    const parsed = platformInfoSchema.safeParse(await this.request('/api/v1/platform', token, undefined, signal))
    if (!parsed.success) throw new Error('平台能力响应格式无效，请联系平台管理员。')
    return parsed.data
  }
  async session(token: string): Promise<void> { await this.request('/api/v1/auth/session', token) }
  async logout(token: string): Promise<void> { await this.request('/api/v1/auth/logout', token, {}) }
  async walletRequest(path: string, token: string, body?: unknown): Promise<unknown> { return this.request(path, token, body) }
  async paymentRequest(path: string, token: string, body?: unknown, signal?: AbortSignal): Promise<unknown> { return this.request(path, token, body, signal) }
  async webSearch(token: string, query: string, requestId: string, signal: AbortSignal): Promise<unknown> {
    return this.request('/api/v1/web-search', token, { query, requestId }, signal)
  }
  async telemetrySettings(token: string): Promise<{ enabled: boolean }> {
    return z.object({ enabled: z.boolean() }).parse(await this.request('/api/v1/telemetry/settings', token))
  }
  async telemetryBatch(token: string, body: unknown, signal: AbortSignal): Promise<unknown> { return this.request('/api/v1/telemetry/operations', token, body, signal) }
  private async request(path: string, token?: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...operationHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: path === '/api/v1/telemetry/operations' && typeof body === 'string' ? body : JSON.stringify(body) }),
      })
      if (!response.ok) {
        if (path === '/api/v1/auth/register' && [400, 409].includes(response.status)) {
          const reader = response.body?.getReader()
          if (reader) {
            const chunks: Uint8Array[] = []; let bytes = 0
            try { while (bytes <= 4096) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; chunks.push(part.value) } }
            finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
            if (bytes <= 4096) {
              let code: unknown
              try { code = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { code?: unknown }).code } catch { /* Fall through to the existing HTTP status error. */ }
              if (typeof code === 'string' && Object.hasOwn(invitationErrors, code)) throw new PlatformRequestError(invitationErrors[code], response.status)
            }
          }
        }
        if (response.status === 401 && token && !path.startsWith('/api/v1/telemetry/')) throw await sessionFault(response, token)
        if (response.status === 400 && path.endsWith('/interview-sessions/start')) {
          await response.body?.cancel().catch(() => undefined)
          throw new PlatformRequestError('面试背景校验失败，请刷新简历、岗位和资料选择后重试。', response.status)
        }
        await response.body?.cancel().catch(() => undefined)
        const message = path === '/api/v1/user-preferences' && response.status === 409 ? '设置已被其他设备修改，当前草稿已保留。请重新读取服务器设置后再修改。'
          : path === '/api/v1/user-preferences' && response.status === 400 ? '设置参数无效，或所选平台服务已下架，请刷新后重新选择。'
          : response.status === 409 && path.startsWith('/api/v1/payment-orders') ? '套餐已变更或停用，请刷新套餐后重新确认购买。'
          : response.status === 503 && path.startsWith('/api/v1/payment-orders') ? '支付暂未开放，请稍后再试。'
          : response.status === 401 ? (path.endsWith('/login') ? '平台登录账号或密码错误。' : '平台登录已失效，请重新登录。')
          : response.status === 409 && path.includes('/interview-sessions/') ? '该账号已有一场进行中的面试，请先结束原面试。'
          : response.status === 402 ? '可用面试时长不足，请联系管理员。'
          : response.status === 403 ? '平台账号没有此服务权限，请联系管理员。'
          : response.status === 429 && path.endsWith('/email-code') ? '验证码发送过于频繁，请稍后再试；如果已收到验证码，请直接填写并提交。'
          : response.status === 429 && path.endsWith('/register') ? '注册尝试过于频繁，请稍后重试。'
          : response.status === 429 && path.endsWith('/login') ? '登录尝试过于频繁，请稍后重试。'
          : response.status === 429 ? '平台请求过于频繁，请稍后重试。'
          : response.status === 409 && (path.endsWith('/register') || path === '/api/v1/auth/email-code') ? '该邮箱已注册，如果该邮箱为您的邮箱，可以直接登录或找回密码。'
          : response.status === 400 && path.endsWith('/password-reset') ? '邮箱、密码或验证码无效，验证码可能已过期，密码修改失败，请检查后重试。'
          : response.status === 404 && path.includes('/password-reset') ? '该邮箱尚未注册，请先注册账号。'
          : response.status === 400 && path.endsWith('/register') ? '邮箱、密码或验证码无效，验证码可能已过期，请检查后重试。'
          : response.status === 503 && path.includes('/auth/') ? '邮箱验证码服务暂不可用，请联系管理员检查邮件服务配置。'
          : `平台请求失败（HTTP ${response.status}），请稍后重试。`
        throw new PlatformRequestError(message, response.status)
      }
      if (response.status === 204) return undefined
      if (!response.body) return undefined
      const reader = response.body.getReader()
      let size = 0
      const chunks: Uint8Array[] = []
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > (path.includes('/interview-sessions/') ? 1_048_576 : path === '/api/v1/web-search' ? 262_144 : MAX_BYTES)) throw new PlatformRequestError('平台响应超过容量限制。')
          chunks.push(chunk.value)
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
      if (size === 0) return undefined
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
      catch { throw new PlatformRequestError('平台响应格式无效。') }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      if (controller.signal.aborted) throw new Error('平台连接超时，请检查平台地址和网络。')
      if (error instanceof TypeError) throw new Error('无法连接平台服务，请检查平台地址和网络。')
      throw error
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
}

export class PlatformService {
  constructor(private readonly store: SettingsStore) {}
  async login(input: unknown): Promise<Settings> {
    const { rememberMe, ...credentials } = parseInput(platformLoginInputSchema.extend({ rememberMe: z.boolean().default(false) }), input)
    const { settings } = await this.store.getConnectionSnapshot()
    if (!settings.platform?.enabled) throw new Error('请先启用平台服务。')
    const client = new PlatformClient(settings.platform.baseUrl)
    const result = await client.login(credentials)
    const info = await client.info(result.accessToken)
    if (info.user.id !== result.user.id) throw new Error('平台账号信息不一致，请重新登录。')
    await this.store.saveRememberedLogin(rememberMe ? credentials : null)
    return this.store.savePlatformSession(client.baseUrl, result.accessToken, result.expiresAt, info)
  }
  async register(input: unknown): Promise<Settings> {
    const { settings } = await this.store.getConnectionSnapshot()
    if (!settings.platform?.enabled) throw new Error('请先配置平台地址。')
    const client = new PlatformClient(settings.platform.baseUrl)
    const result = await client.register(input)
    const info = await client.info(result.accessToken)
    if (info.user.id !== result.user.id) throw new Error('注册账号信息不一致，请重新登录。')
    return this.store.savePlatformSession(client.baseUrl, result.accessToken, result.expiresAt, info)
  }
  async emailCode(input: unknown) {
    const { platform } = await this.store.getSettings()
    if (!platform?.enabled) throw new Error('请先配置平台地址。')
    return new PlatformClient(platform.baseUrl, 15000).emailCode(input)
  }
  async passwordResetCode(input: unknown) {
    const { platform } = await this.store.getSettings()
    if (!platform?.enabled) throw new Error('请先配置平台地址。')
    return new PlatformClient(platform.baseUrl, 15000).passwordResetCode(input)
  }
  async resetPassword(input: unknown): Promise<void> {
    const { platform } = await this.store.getSettings()
    if (!platform?.enabled) throw new Error('请先配置平台地址。')
    await new PlatformClient(platform.baseUrl, 15000).resetPassword(input)
  }
  async logout(): Promise<Settings> {
    const snapshot = await this.store.getConnectionSnapshot()
    // Clear locally first, even when an unreachable backend cannot revoke the remote token.
    const saved = await this.store.clearPlatformSession(snapshot.secrets.platformAccessToken)
    if (snapshot.secrets.platformAccessToken && snapshot.settings.platform) {
      try { await new PlatformClient(snapshot.settings.platform.baseUrl).logout(snapshot.secrets.platformAccessToken) }
      catch { /* Local logout is complete; the short-lived server credential expires independently. */ }
    }
    return saved
  }
  async refresh(signal?: AbortSignal): Promise<Settings> {
    const snapshot = await this.store.getConnectionSnapshot()
    return this.refreshSnapshot(snapshot, signal)
  }
  async refreshSnapshot(snapshot: { settings: Settings; secrets: ServiceSecrets }, signal?: AbortSignal): Promise<Settings> {
    const { platform } = snapshot.settings
    if (!platform?.enabled) throw new Error('请先启用平台服务。')
    if (!platform.authenticated || !snapshot.secrets.platformAccessToken || !platform.expiresAt) throw new Error('请先登录平台账号。')
    try {
      const info = await new PlatformClient(platform.baseUrl).info(snapshot.secrets.platformAccessToken, signal)
      return await this.store.savePlatformSession(platform.baseUrl, snapshot.secrets.platformAccessToken, platform.expiresAt, info, snapshot.secrets.platformAccessToken)
    } catch (error) {
      if (error instanceof SessionFault) throw error
      throw error
    }
  }
}
