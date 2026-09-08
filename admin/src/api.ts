import type { z } from 'zod'
export class ApiError extends Error { constructor(message: string, readonly status: number, readonly code = '') { super(message) } }
export class ApiClient {
  private readonly controllers = new Set<AbortController>()
  constructor(private token = '', private readonly onExpired: () => void = () => undefined) {}
  dispose(): void { this.token = ''; for (const controller of this.controllers) controller.abort(); this.controllers.clear() }
  async logout(): Promise<void> {
    const client = new ApiClient(this.token)
    this.dispose()
    try { await client.empty('/auth/logout') } catch { /* The local session is already cleared. */ } finally { client.dispose() }
  }
  async request<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    return this.send(path, options).then(value => { const result = schema.safeParse(value); if (!result.success) throw new ApiError('服务响应格式不兼容，请联系管理员。', 502); return result.data })
  }
  async empty(path: string, body: unknown = {}): Promise<void> { await this.send(path, { method: 'POST', body }) }
  private async send(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<unknown> {
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal?.reason)
    this.controllers.add(controller)
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    const timer = setTimeout(() => controller.abort(new Error('请求超时，请重试。')), 35_000)
    try {
      const response = await fetch(`/api/v1${path}`, { method: options.method ?? 'GET', signal: controller.signal, redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) })
      if (response.status === 401) { this.dispose(); this.onExpired(); throw new ApiError(path === '/auth/login' ? '用户名或密码错误。' : '登录已失效，请重新登录。', 401) }
      const text = response.status === 204 ? '' : await response.text()
      if (text.length > 2_000_000) throw new ApiError('服务响应超过容量限制。', 502)
      let data: unknown
      try { data = text ? JSON.parse(text) as unknown : undefined } catch { throw new ApiError('服务没有返回有效数据，请检查后端连接。', 502) }
      if (!response.ok) {
        const detail = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}
        throw new ApiError(typeof detail.message === 'string' ? detail.message.slice(0, 600) : `请求失败（HTTP ${response.status}）。`, response.status, typeof detail.code === 'string' ? detail.code : '')
      }
      return data
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason
      if (error instanceof ApiError) throw error
      if (controller.signal.aborted) throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error('请求已取消。')
      throw new Error('无法连接平台服务，请检查网络与服务状态。')
    } finally { clearTimeout(timer); this.controllers.delete(controller); options.signal?.removeEventListener('abort', abort) }
  }
}
export function message(error: unknown): string { return error instanceof Error ? error.message : '操作未完成，请重试。' }
