import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import type { ReferenceDocument, ReferenceKind, RetrievalContext, Settings } from '../../shared/types'
import { chunkDocument } from './chunker'
import { extractDocument } from './document-extractor'
import { DocumentStore, type IndexData } from './document-store'
import { EmbeddingClient, embeddingFingerprint } from './embedding-client'
import { RetrievalService, type EmbeddingProvider } from './retrieval-service'
import { isLoopback, parseInput } from './validation'

const identifier = z.string().uuid()
const patchSchema = z.object({ enabled: z.boolean().optional(), kind: z.enum(['technical', 'personal']).optional() }).strict()
async function contentHash(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const block of createReadStream(path)) hash.update(block)
  return hash.digest('hex')
}
async function copySource(path: string, copy: string): Promise<void> {
  let size = 0
  await pipeline(createReadStream(path), new Transform({ transform(block, _encoding, callback) {
    size += block.length
    callback(size > 10 * 1024 * 1024 ? new Error('文件不能超过 10 MB。') : null, block)
  } }), createWriteStream(copy, { flags: 'wx', mode: 0o600 }))
}
async function deletePrivateCopy(path: string): Promise<void> {
  try { await unlink(path) }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new Error('资料副本无法删除，请检查资料目录权限后重试。')
  }
}
function failureMessage(error: unknown): string {
  return error instanceof Error && /^(PDF|文档|资料|文件|文本|未提取|仅支持|向量|请先)/.test(error.message)
    ? error.message.slice(0, 500) : '资料处理失败，请检查文件、向量服务和网络后重试。'
}

export class ReferenceService {
  private readonly store: DocumentStore
  private readonly retrieval: RetrievalService
  private readonly directory: string
  private readonly queue = new Set<string>()
  private readonly parsers = new Map<string, AbortController>()
  private configuration?: Awaited<ReturnType<EmbeddingProvider>>
  private running = false
  private job?: { id: string; controller: AbortController }
  private disposed = false
  private importTail: Promise<unknown> = Promise.resolve()
  private configurationTail: Promise<void> = Promise.resolve()

  constructor(userDataPath: string, private readonly emitDocumentsChanged: () => void, private readonly getEmbedding: EmbeddingProvider) {
    this.directory = join(userDataPath, 'documents')
    this.store = new DocumentStore(userDataPath)
    this.retrieval = new RetrievalService(this.store, getEmbedding)
    void this.refreshConfiguration()
  }

  list(): Promise<ReferenceDocument[]> { return this.store.request('list') }

  importFiles(paths: string[]): Promise<ReferenceDocument[]> {
    const files = parseInput(z.array(z.string().min(1).max(4096)).min(1).max(30), paths)
    const result = this.importTail.then(async () => {
      const imported: ReferenceDocument[] = []
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      for (const path of files) {
        this.assertOpen()
        const extension = extname(path).toLowerCase()
        if (!['.pdf', '.txt', '.md'].includes(extension)) throw new Error('仅支持 PDF、TXT 和 MD 文件。')
        let source
        try { source = await stat(path) }
        catch { throw new Error('文件无法读取，请确认原文件仍然存在。') }
        if (!source.isFile() || source.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB，且必须是普通文件。')
        const id = randomUUID()
        const copy = join(this.directory, `${id}${extension}`)
        let created = false
        try {
          await copySource(path, copy)
          const hash = await contentHash(copy)
          const existing = await this.store.request<ReferenceDocument | null>('findHash', { hash })
          if (existing) { imported.push(existing); continue }
          await this.store.request('create', { id, name: basename(path).slice(0, 255), hash, path: copy })
          created = true
          this.changed()
          await this.parse(id, copy)
          let current: IndexData
          try { current = await this.store.request<IndexData>('indexData', { id }) }
          catch (error) {
            if (error instanceof Error && error.message === '资料不存在或已移除。') continue
            throw error
          }
          imported.push(current.document)
          if (current.document.status === 'pending') this.enqueue(id)
        } finally { if (!created) await deletePrivateCopy(copy) }
      }
      return imported
    })
    this.importTail = result.catch(() => undefined)
    return result
  }

  preview(id: string): Promise<{ document: ReferenceDocument; text: string }> {
    return this.store.request('preview', { id: parseInput(identifier, id) })
  }

  async update(id: string, patch: { enabled?: boolean; kind?: ReferenceKind }): Promise<void> {
    parseInput(identifier, id)
    const validated = parseInput(patchSchema, patch)
    await this.store.request('update', { id, patch: validated })
    if (validated.enabled === false) { this.queue.delete(id); if (this.job?.id === id) this.job.controller.abort() }
    if (validated.enabled === true) {
      const data = await this.store.request<IndexData>('indexData', { id })
      const mismatched = this.configuration && data.fingerprint !== embeddingFingerprint(this.configuration.config)
      if (data.pages.length && (data.document.status === 'pending' || mismatched)) {
        await this.store.request('mark', { id, status: 'pending' })
        this.enqueue(id)
      }
    }
    this.retrieval.clear()
    this.changed()
  }

  async remove(id: string): Promise<void> {
    parseInput(identifier, id)
    const data = await this.store.request<IndexData>('indexData', { id })
    this.queue.delete(id)
    this.parsers.get(id)?.abort()
    if (this.job?.id === id) this.job.controller.abort()
    try { await deletePrivateCopy(data.path) }
    catch (error) {
      await this.store.request('mark', { id, status: 'error', error: failureMessage(error) })
      this.changed()
      throw error
    }
    await this.store.request('remove', { id })
    this.retrieval.clear()
    this.changed()
  }

  async reindex(id: string): Promise<void> {
    parseInput(identifier, id)
    const data = await this.store.request<IndexData>('indexData', { id })
    if (this.job?.id === id) this.job.controller.abort()
    if (!data.pages.length) await this.parse(id, data.path)
    else await this.store.request('mark', { id, status: 'pending' })
    const current = await this.store.request<IndexData>('indexData', { id })
    if (current.document.status === 'pending' && current.document.enabled) this.enqueue(id)
    this.changed()
  }

  retrieve(question: string, transcript: string, settings: Settings, signal: AbortSignal): Promise<RetrievalContext> {
    return this.retrieval.retrieve(question, transcript, settings, signal)
  }

  refreshConfiguration(): Promise<void> {
    const refresh = this.configurationTail.then(async () => {
      if (this.disposed) return
      const current = await this.getEmbedding()
      const fingerprint = embeddingFingerprint(current.config)
      const changed = !this.configuration || embeddingFingerprint(this.configuration.config) !== fingerprint || this.configuration.apiKey !== current.apiKey
      if (!changed) { this.pump(); return }
      if (changed) this.configuration = { config: { ...current.config }, apiKey: current.apiKey }
      if (changed) { this.job?.controller.abort(); this.retrieval.clear() }
      const documents = await this.list()
      for (const document of documents) {
        if (!document.enabled || document.status === 'parsing') continue
        if (!changed && this.job?.id === document.id) continue
        const data = await this.store.request<IndexData>('indexData', { id: document.id })
        if (!data.pages.length) continue
        if (data.fingerprint !== fingerprint || document.status === 'pending' || (changed && document.status === 'error')) {
          await this.store.request('mark', { id: document.id, status: 'pending' })
          this.queue.add(document.id)
        }
      }
      this.changed()
      this.pump()
    }).catch(async () => {
      // Settings have already been saved; expose indexing failure without turning that save into a false failure.
      this.configuration = undefined
      this.queue.clear()
      this.job?.controller.abort()
      const documents = await this.list().catch(() => [])
      await Promise.allSettled(documents.filter((document) => ['pending', 'indexing'].includes(document.status)).map((document) =>
        this.store.request('mark', { id: document.id, status: 'error', error: '无法读取向量配置或资料库，请检查配置后重试。' })))
      this.changed()
    })
    this.configurationTail = refresh
    return refresh
  }

  dispose(): void {
    this.disposed = true
    this.queue.clear()
    this.job?.controller.abort()
    for (const parser of this.parsers.values()) parser.abort()
    this.parsers.clear()
    this.retrieval.clear()
    this.store.dispose()
  }

  private async parse(id: string, path: string): Promise<void> {
    this.parsers.get(id)?.abort()
    const controller = new AbortController()
    this.parsers.set(id, controller)
    try {
      await this.store.request('mark', { id, status: 'parsing' })
      this.changed()
      const extracted = await extractDocument(path, controller.signal)
      controller.signal.throwIfAborted()
      const chunks = chunkDocument(extracted.pages, extracted.pageCount > 0)
      await this.store.request('setText', { id, pages: extracted.pages, pageCount: extracted.pageCount, chunks })
    } catch (error) {
      if (!controller.signal.aborted) await this.store.request('mark', { id, status: 'error', error: failureMessage(error) }).catch(() => undefined)
    } finally {
      if (this.parsers.get(id) === controller) this.parsers.delete(id)
      this.changed()
    }
  }

  private enqueue(id: string): void { if (!this.disposed) { this.queue.add(id); this.pump() } }

  private pump(): void {
    if (this.running || this.disposed || !this.configuration) return
    const config = this.configuration
    if (!config.apiKey.trim() && !isLoopback(new URL(config.config.baseUrl).hostname)) return
    this.running = true
    void (async () => {
      while (this.queue.size && !this.disposed) {
        if (!this.configuration?.apiKey.trim() && this.configuration && !isLoopback(new URL(this.configuration.config.baseUrl).hostname)) break
        const id = this.queue.values().next().value
        if (!id) break
        this.queue.delete(id)
        const configuration = this.configuration
        if (!configuration) break
        await this.index(id, configuration)
      }
    })().catch(() => undefined).finally(() => { this.running = false; if (this.queue.size && !this.disposed) this.pump() })
  }

  private async index(id: string, configuration: Awaited<ReturnType<EmbeddingProvider>>): Promise<void> {
    const controller = new AbortController()
    this.job = { id, controller }
    try {
      const data = await this.store.request<IndexData>('indexData', { id })
      if (!data.document.enabled || !data.pages.length) return
      await this.store.request('mark', { id, status: 'indexing' })
      this.changed()
      const chunks = chunkDocument(data.pages, data.document.pageCount > 0)
      const vectors: number[][] = []
      const client = new EmbeddingClient(configuration.config, configuration.apiKey)
      for (let i = 0; i < chunks.length; i += 10) {
        controller.signal.throwIfAborted()
        vectors.push(...await client.embed(chunks.slice(i, i + 10).map((chunk) => chunk.text), controller.signal))
      }
      controller.signal.throwIfAborted()
      if (this.disposed || this.configuration !== configuration) return
      await this.store.request('commit', { id, revision: data.document.revision, fingerprint: embeddingFingerprint(configuration.config), chunks, vectors })
      this.retrieval.clear()
    } catch (error) {
      const missingConfiguration = controller.signal.aborted && !this.configuration
      await this.store.request('mark', { id, status: controller.signal.aborted && !missingConfiguration ? 'pending' : 'error',
        error: missingConfiguration ? '无法读取向量配置，请检查配置后重试。' : controller.signal.aborted ? '' : failureMessage(error) }).catch(() => undefined)
    } finally {
      if (this.job?.controller === controller) this.job = undefined
      this.changed()
    }
  }

  private changed(): void { if (!this.disposed) this.emitDocumentsChanged() }
  private assertOpen(): void { if (this.disposed) throw new Error('资料库已关闭。') }
}
