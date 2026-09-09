import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Settings } from '../../shared/types'
import { embeddingSettingsSchema, isLoopback, parseInput } from './validation'

export const CHUNK_VERSION = 1
export function embeddingFingerprint(config: Settings['embedding']): string {
  return createHash('sha256').update(JSON.stringify({
    baseUrl: config.baseUrl.replace(/\/+$/, ''), model: config.model, dimensions: config.dimensions, chunkVersion: CHUNK_VERSION,
    ...(config.serviceId ? { serviceId: config.serviceId, fingerprint: config.fingerprint } : {}),
  })).digest('hex')
}
const responseSchema = z.object({ data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number().finite()) })) })

export class EmbeddingClient {
  constructor(private readonly config: Settings['embedding'], private readonly apiKey: string) {}

  async embed(input: string[], signal?: AbortSignal): Promise<number[][]> {
    try { return await this.request(input, signal) }
    catch (error) {
      if (signal?.aborted) throw signal.reason
      if (error instanceof Error && /^(向量|请先)/.test(error.message)) throw error
      throw new Error('向量服务连接失败或超时，请检查地址、网络和 API Key。')
    }
  }

  private async request(input: string[], signal?: AbortSignal): Promise<number[][]> {
    const config = parseInput(embeddingSettingsSchema, this.config)
    if (!input.length || input.length > 10 || input.some((text) => !text.trim() || text.length > 20_000)) throw new Error('向量输入为空或超过批次限制。')
    const base = new URL(config.baseUrl.replace(/\/+$/, ''))
    if (!this.apiKey.trim() && !isLoopback(base.hostname)) throw new Error('请先配置向量服务 API Key。')
    const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)])
    combined.throwIfAborted()
    if (!base.pathname.endsWith('/embeddings')) base.pathname += '/embeddings'
    const response = await fetch(base, {
      method: 'POST', redirect: 'error', signal: combined,
      headers: { 'Content-Type': 'application/json', ...(this.apiKey.trim() ? { Authorization: `Bearer ${this.apiKey.trim()}` } : {}) },
      body: JSON.stringify({ model: config.model, input, dimensions: config.dimensions, encoding_format: 'float',
        ...(this.config.serviceId ? { serviceId: this.config.serviceId } : {}) }),
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error(`向量服务请求失败（HTTP ${response.status}），请检查配置和额度。`) }
    if (!response.body) throw new Error('向量服务没有返回结果。')
    const reader = response.body.getReader()
    const parts: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 8_388_608) throw new Error('向量服务响应超过容量限制。')
        parts.push(value)
      }
    } finally { await reader.cancel().catch(() => undefined) }
    let raw: unknown
    try { raw = JSON.parse(Buffer.concat(parts).toString('utf8')) }
    catch { throw new Error('向量服务返回的 JSON 无效。') }
    const result = responseSchema.safeParse(raw)
    if (!result.success || result.data.data.length !== input.length) throw new Error('向量服务响应格式不兼容。')
    const ordered = [...result.data.data].sort((a, b) => a.index - b.index)
    const vectors = ordered.map((item) => item.embedding.map(Math.fround))
    if (ordered.some((item, index) => item.index !== index || item.embedding.length !== config.dimensions ||
      !vectors[index].every(Number.isFinite) || !vectors[index].some((value) => value !== 0))) {
      throw new Error('向量数量、顺序或维度与配置不匹配，请检查模型和维度。')
    }
    return vectors
  }

  async test(signal?: AbortSignal): Promise<{ latencyMs: number; message: string }> {
    const started = performance.now()
    await this.embed(['验证向量服务连接'], signal)
    return { latencyMs: Math.round(performance.now() - started), message: `向量服务可用，维度 ${this.config.dimensions}。` }
  }
}
