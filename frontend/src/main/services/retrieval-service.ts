import { createHash } from 'node:crypto'
import type { ReferenceExcerpt, RetrievalContext, Settings } from '../../shared/types'
import { DocumentStore, type DocumentSnapshot } from './document-store'
import { EmbeddingClient, embeddingFingerprint } from './embedding-client'
import { resolveEmbeddingConfig } from './service-routing'

export type EmbeddingProvider = () => Promise<{ config: Settings['embedding']; apiKey: string }>

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason)
    signal.addEventListener('abort', aborted, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted)).catch(() => undefined)
    if (signal.aborted) aborted()
  })
}

export class RetrievalService {
  private readonly cache = new Map<string, number[]>()
  constructor(private readonly store: DocumentStore, private readonly getEmbedding: EmbeddingProvider) {}

  async retrieve(question: string, transcript: string, settings: Settings, signal: AbortSignal): Promise<RetrievalContext> {
    try { return await this.run(question, transcript, settings, signal) }
    catch {
      signal.throwIfAborted()
      return { status: 'degraded', message: '资料读取失败，本次未提供参考片段，仍参考简历和岗位描述。', excerpts: [] }
    }
  }

  private async run(question: string, transcript: string, settings: Settings, signal: AbortSignal): Promise<RetrievalContext> {
    signal.throwIfAborted()
    if (!settings.retrieval.enabled) return { status: 'disabled', excerpts: [] }
    const referenceIds = settings.interviewEnvironment ? [...settings.interviewEnvironment.referenceIds] : undefined
    if (referenceIds?.length === 0) return { status: 'empty', message: '当前面试环境未选择参考资料。', excerpts: [] }
    const refersBack = /这个|那个|这些|那些|上述|刚才|前面|刚刚|它|该项目|该方案|\b(this|that|these|those|it)\b/i.test(question)
    const context = refersBack ? transcript.trim().split(/\n+/).slice(-3).join('\n').slice(-1800) : ''
    const query = [question.trim().slice(0, 12_000), context].filter(Boolean).join('\n最近对话：')
    if (!question.trim()) return { status: 'empty', message: '没有可检索的问题。', excerpts: [] }
    const snapshot = await this.store.request<DocumentSnapshot>('snapshot', { referenceIds })
    try {
      signal.throwIfAborted()
      if (!snapshot.count) return { status: 'empty', message: '没有已建索引的启用资料。', excerpts: [] }
      let fingerprint = embeddingFingerprint(settings.embedding)
      const budget = AbortSignal.any([signal, AbortSignal.timeout(1000)])
      let vector: number[] | undefined
      let message: string | undefined
      try {
        const config = resolveEmbeddingConfig(settings)
        fingerprint = embeddingFingerprint(config)
        const key = createHash('sha256').update(`${fingerprint}\n${snapshot.version}\n${query}`).digest('hex')
        const current = await abortable(this.getEmbedding(), budget)
        if (embeddingFingerprint(current.config) !== fingerprint) throw new Error('向量配置已改变，本次使用关键词检索。')
        if (!snapshot.fingerprints.includes(fingerprint)) throw new Error('资料需要按当前向量配置重建，本次使用关键词检索。')
        vector = this.cache.get(key)
        if (!vector) {
          const vectors = await new EmbeddingClient(config, current.apiKey).embed([query], budget)
          vector = vectors[0]
          if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value ?? '')
          this.cache.set(key, vector)
        }
        if (snapshot.fingerprints.some((value) => value !== fingerprint)) message = '部分资料正在重建，本次同时使用关键词检索。'
      } catch (error) {
        signal.throwIfAborted()
        message = error instanceof Error && /^向量配置|^资料需要/.test(error.message)
          ? error.message : '向量检索不可用或超过 1 秒，本次使用本地关键词检索。'
      }
      signal.throwIfAborted()
      const excerpts = await this.store.request<ReferenceExcerpt[]>('search', { id: snapshot.id, query: question, context, vector, fingerprint })
      signal.throwIfAborted()
      return { status: message ? 'degraded' : excerpts.length ? 'ready' : 'empty', ...(message ? { message } : {}), excerpts }
    } finally { await this.store.request('releaseSnapshot', { id: snapshot.id }).catch(() => undefined) }
  }

  clear(): void { this.cache.clear() }
}
