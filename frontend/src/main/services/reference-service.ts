import { operationHeaders } from './operations-telemetry'
import { assertPlatformTransport } from '../../shared/platform-transport'
import { open } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { z } from 'zod'
import type { ReferenceDocument, ReferenceKind, RetrievalContext, Settings } from '../../shared/types'
import type { SettingsStore } from './settings-store'
import { parseInput, referencePatchSchema, retrievalContextSchema } from './validation'

const identifier = z.string().uuid()
const documentSchema = z.object({
  id: identifier, name: z.string().max(255), kind: z.enum(['technical', 'personal']), enabled: z.boolean(),
  status: z.enum(['parsing', 'pending', 'indexing', 'ready', 'error']), pageCount: z.number().int().nonnegative(),
  contentHash: z.string().max(128), revision: z.number().int().nonnegative(), createdAt: z.string(), updatedAt: z.string(),
  error: z.string().max(2000).optional(), chunkCount: z.number().int().nonnegative(),
})
export class ReferenceService {
  private readonly lifetime = new AbortController()
  constructor(private readonly changed: () => void,
    private readonly authentication: () => ReturnType<SettingsStore['getConnectionSnapshot']>,
    private readonly expired?: (token: string) => Promise<void>) {}

  async list(): Promise<ReferenceDocument[]> { return parseInput(z.array(documentSchema).max(100), await this.request('', 'GET')) }
  async importFiles(paths: string[]): Promise<ReferenceDocument[]> {
    const files = parseInput(z.array(z.string().min(1).max(4096)).min(1).max(20), paths)
    const documents: ReferenceDocument[] = []
    for (const path of files) {
      this.lifetime.signal.throwIfAborted()
      if (!['.pdf', '.txt', '.md'].includes(extname(path).toLowerCase())) throw new Error('仅支持 PDF、TXT 和 MD 文件。')
      const file = await open(path, 'r')
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB，且必须是普通文件。')
        // Read through the checked handle with a bounded buffer, even if the file grows concurrently.
        const buffer = Buffer.alloc(10 * 1024 * 1024 + 1)
        let count = 0
        while (count < buffer.length) {
          const { bytesRead } = await file.read(buffer, count, buffer.length - count, null)
          if (!bytesRead) break
          count += bytesRead
        }
        if (count > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB。')
        const form = new FormData()
        form.append('file', new Blob([buffer.subarray(0, count)]), basename(path))
        documents.push(parseInput(documentSchema, await this.request('', 'POST', form)))
        this.changed()
      } finally { await file.close() }
    }
    return documents
  }
  async preview(id: string): Promise<{ document: ReferenceDocument; text: string }> {
    return parseInput(z.object({ document: documentSchema, text: z.string().max(2_000_000) }), await this.request(`/${parseInput(identifier, id)}/preview`, 'GET'))
  }
  async update(id: string, patch: { enabled?: boolean; kind?: ReferenceKind }): Promise<void> {
    await this.request(`/${parseInput(identifier, id)}`, 'PATCH', parseInput(referencePatchSchema, patch)); this.changed()
  }
  async remove(id: string): Promise<void> { await this.request(`/${parseInput(identifier, id)}`, 'DELETE'); this.changed() }
  async reindex(id: string): Promise<void> { await this.request(`/${parseInput(identifier, id)}/reindex`, 'POST', {}); this.changed() }
  async retrieve(question: string, _transcript: string, settings: Settings, signal: AbortSignal): Promise<RetrievalContext> {
    signal.throwIfAborted()
    if (!settings.retrieval.enabled) return { status: 'disabled', excerpts: [] }
    const referenceIds = settings.interviewEnvironment?.referenceIds ?? []
    if (!referenceIds.length || !question.trim()) return { status: 'empty', message: '当前面试环境未选择参考资料。', excerpts: [] }
    try { return parseInput(retrievalContextSchema, await this.request('/search', 'POST', { query: question.trim().slice(0, 12_000), referenceIds }, signal)) }
    catch (error) {
      signal.throwIfAborted(); this.lifetime.signal.throwIfAborted()
      if (error instanceof Error && error.message.includes('登录')) throw error
      return { status: 'degraded', message: '平台资料检索暂不可用，本次仍参考简历和岗位描述回答。', excerpts: [] }
    }
  }
  dispose(): void { this.lifetime.abort(new Error('账户已切换，请重试。')) }
  private async request(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const combined = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : []), AbortSignal.timeout(30_000)])
    combined.throwIfAborted()
    const { settings, secrets } = await this.authentication()
    if (!settings.platform?.authenticated || !secrets.platformAccessToken) throw new Error('平台登录已失效，请重新登录。')
    combined.throwIfAborted()
    const multipart = body instanceof FormData
    assertPlatformTransport(settings.platform.baseUrl)
    const response = await fetch(`${settings.platform.baseUrl}/api/v1/references${path}`, {
      method, signal: combined, redirect: 'error', headers: { ...operationHeaders(), Authorization: `Bearer ${secrets.platformAccessToken}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401) { await this.expired?.(secrets.platformAccessToken); throw new Error('平台登录已失效，请重新登录。') }
      if (response.status === 403) throw new Error('没有该资料的访问权限。')
      if (response.status === 404) throw new Error('资料不存在或已移除。')
      if (response.status === 413) throw new Error('文件或资料总量超过平台限制。')
      if (response.status === 429) throw new Error('资料请求过于频繁或额度不足，请稍后重试。')
      throw new Error(`平台资料请求失败（HTTP ${response.status}），请稍后重试。`)
    }
    if (response.status === 204) return undefined
    const reader = response.body?.getReader()
    if (!reader) throw new Error('平台资料响应为空。')
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.length
        if (size > 8_000_000) throw new Error('平台资料响应超过容量限制。')
        chunks.push(part.value)
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
    combined.throwIfAborted()
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  }
}
