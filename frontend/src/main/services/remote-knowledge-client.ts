import { operationHeaders } from './operations-telemetry'
import { createHash } from 'node:crypto'
import type { ReferenceExcerpt, RetrievalContext, Settings } from '../../shared/types'
import { remoteKnowledgeSettingsSchema } from './validation'

const MAX_RESPONSE_BYTES = 2 * 1_048_576
class RemoteKnowledgeError extends Error {}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function string(value: unknown): string { return typeof value === 'string' ? value : '' }
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => {
      signal.removeEventListener('abort', abort); reject(error)
    })
    if (signal.aborted) abort()
  })
}

function extractExcerpts(raw: unknown, namespace: string): ReferenceExcerpt[] {
  const response = object(raw)
  if (!response || response.success !== true) throw new RemoteKnowledgeError('百炼远程知识库检索未成功，请检查 Agent 发布状态、权限和服务额度。')
  for (const field of ['code', 'status'] as const) {
    if (field in response && string(response[field]).toUpperCase() !== 'SUCCESS') {
      throw new RemoteKnowledgeError('百炼远程知识库返回失败状态，请检查 Agent 发布状态、权限和服务额度。')
    }
  }
  if ('status_code' in response && response.status_code !== 200) throw new RemoteKnowledgeError('百炼远程知识库返回失败状态，请检查 Agent 发布状态、权限和服务额度。')
  const nodes = object(response.data)?.nodes
  if (!Array.isArray(nodes)) throw new RemoteKnowledgeError('百炼远程知识库响应格式不兼容，请检查是否填写了知识检索接口地址。')
  const excerpts: ReferenceExcerpt[] = []
  let remaining = 6000
  for (const [index, value] of nodes.entries()) {
    if (excerpts.length >= 6 || remaining <= 0) break
    const node = object(value)
    const text = string(node?.text).trim().slice(0, Math.min(2000, remaining))
    if (!text) continue
    // Keep only provider text; identifiers below are local bookkeeping for history and rendering.
    const documentId = `bailian:${hash(namespace)}`
    excerpts.push({
      source: 'bailian', kind: 'technical', revision: 1, documentId, name: '百炼远程知识库',
      chunkId: `bailian:${hash([documentId, index, text])}`, text,
    })
    remaining -= text.length
  }
  return excerpts
}

export class RemoteKnowledgeClient {
  private readonly config: Settings['remoteKnowledge']
  constructor(config: Settings['remoteKnowledge'], private readonly apiKey: string, private readonly timeoutMs = 5000, private readonly platform = false) {
    this.config = { ...config, agentId: config.agentId.trim() }
  }

  async retrieve(query: string, signal: AbortSignal): Promise<RetrievalContext> {
    signal.throwIfAborted()
    if (!this.config.enabled) return { status: 'disabled', excerpts: [] }
    const agentId = this.config.agentId.slice(0, 200)
    try {
      const excerpts = await this.request(query, signal)
      const status = excerpts.length ? 'ready' : 'empty'
      const message = excerpts.length ? undefined : '百炼远程知识库未找到相关内容。'
      return { status, excerpts, ...(message ? { message } : {}), remote: { agentId, status, ...(message ? { message } : {}) } }
    } catch (error) {
      signal.throwIfAborted()
      const message = error instanceof RemoteKnowledgeError ? error.message : '百炼远程知识库连接失败，请检查完整请求地址、网络和 API Key。'
      return { status: 'degraded', message, excerpts: [], remote: { agentId, status: 'degraded', message } }
    }
  }

  async test(signal = new AbortController().signal): Promise<{ latencyMs: number; message: string }> {
    const started = performance.now()
    try {
      const excerpts = await this.request('远程知识库连接测试', signal)
      return { latencyMs: Math.round(performance.now() - started), message: excerpts.length ? '百炼远程知识库连接成功。' : '百炼远程知识库连接成功，本次测试未匹配内容。' }
    } catch (error) {
      signal.throwIfAborted()
      throw error instanceof RemoteKnowledgeError ? error : new Error('百炼远程知识库连接失败，请检查完整请求地址、网络和 API Key。')
    }
  }

  private async request(query: string, signal: AbortSignal): Promise<ReferenceExcerpt[]> {
    const parsed = remoteKnowledgeSettingsSchema.safeParse({ ...this.config, enabled: true })
    if (!parsed.success) throw new RemoteKnowledgeError('请填写有效的百炼远程知识库完整请求地址和 Agent ID；地址必须使用 HTTP 或 HTTPS。')
    if (!query.trim() || query.length > 20_000) throw new RemoteKnowledgeError('远程知识库检索问题为空或超过 20,000 字符。')
    const apiKey = this.apiKey.trim()
    if (!apiKey || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new RemoteKnowledgeError('请在模型与设置中填写有效的百炼远程知识库 API Key。')
    signal.throwIfAborted()
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    const timeout = setTimeout(() => controller.abort(new RemoteKnowledgeError('百炼远程知识库检索超时，本次跳过知识库并继续回答。')), this.timeoutMs)
    const budget = controller.signal
    try {
      if (signal.aborted) onAbort()
      budget.throwIfAborted()
      const pendingResponse = fetch(parsed.data.url, {
        method: 'POST', redirect: 'error', signal: budget,
        headers: { 'Content-Type': 'application/json', ...(this.platform ? operationHeaders() : {}), Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ agent_id: parsed.data.agentId, query, images: [], ...(this.config.serviceId ? { serviceId: this.config.serviceId } : {}) }),
      })
      // Clean up even when a transport returns a response after cancellation.
      void pendingResponse.then(response => {
        if (budget.aborted) void response.body?.cancel().catch(() => undefined)
      }, () => undefined)
      const response = await abortable(pendingResponse, budget)
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined)
        throw new RemoteKnowledgeError(`百炼远程知识库请求失败（HTTP ${response.status}），请检查配置、权限和额度。`)
      }
      if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
        void response.body?.cancel().catch(() => undefined)
        throw new RemoteKnowledgeError('百炼远程知识库响应超过 2 MiB 容量限制。')
      }
      if (!response.body) throw new RemoteKnowledgeError('百炼远程知识库没有返回响应内容。')
      const reader = response.body.getReader()
      const cancelReader = () => { void reader.cancel().catch(() => undefined) }
      budget.addEventListener('abort', cancelReader, { once: true })
      const contents = Buffer.allocUnsafe(MAX_RESPONSE_BYTES)
      let size = 0
      try {
        while (true) {
          const { done, value } = await abortable(reader.read(), budget)
          budget.throwIfAborted()
          if (done) break
          if (size + value.byteLength > MAX_RESPONSE_BYTES) throw new RemoteKnowledgeError('百炼远程知识库响应超过 2 MiB 容量限制。')
          contents.set(value, size)
          size += value.byteLength
        }
      } finally {
        budget.removeEventListener('abort', cancelReader)
        cancelReader()
        reader.releaseLock()
      }
      let raw: unknown
      try { raw = JSON.parse(contents.subarray(0, size).toString('utf8')) }
      catch { throw new RemoteKnowledgeError('百炼远程知识库返回的 JSON 无效，请检查知识检索接口地址。') }
      budget.throwIfAborted()
      return extractExcerpts(raw, `${parsed.data.url}\n${parsed.data.agentId}`)
    } catch (error) {
      signal.throwIfAborted()
      if (budget.aborted) throw budget.reason
      throw error
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
  }
}
