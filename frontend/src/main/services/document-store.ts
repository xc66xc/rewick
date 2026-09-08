import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { ReferenceDocument } from '../../shared/types'
import type { DocumentPage } from './chunker'

export interface IndexData { document: ReferenceDocument; path: string; fingerprint: string; pages: DocumentPage[] }
export interface DocumentSnapshot { id: string; count: number; version: string; fingerprints: string[] }

export class DocumentStore {
  private worker?: Worker
  private readonly ready: Promise<void>
  private nextId = 0
  private closed = false
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()

  constructor(rootDir: string) {
    this.ready = mkdir(rootDir, { recursive: true, mode: 0o700 }).then(() => new Promise<void>((resolve, reject) => {
      if (this.closed) { reject(new Error('资料库已关闭。')); return }
      this.worker = new Worker(new URL('./document-store-worker.mjs', import.meta.url), { workerData: { path: join(rootDir, 'references.sqlite') } })
      const failed = () => {
        const error = new Error('资料数据库进程不可用，请重新打开应用。')
        reject(error)
        for (const request of this.pending.values()) request.reject(error)
        this.pending.clear()
        this.closed = true
      }
      this.worker.on('message', (message: { ready?: boolean; id?: number; value?: unknown; error?: string }) => {
        if (message.ready) { resolve(); return }
        const request = this.pending.get(message.id!)
        if (!request) return
        this.pending.delete(message.id!)
        if (message.error) request.reject(new Error(message.error))
        else request.resolve(message.value)
      })
      this.worker.on('error', failed)
      this.worker.on('exit', failed)
    }))
    void this.ready.catch(() => undefined)
  }

  async request<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.ready
    if (this.closed || !this.worker) throw new Error('资料库已关闭。')
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
      this.worker!.postMessage({ id, operation, args })
    })
  }

  dispose(): void {
    if (this.closed) return
    void this.request('close').catch(() => undefined).finally(() => {
      this.closed = true
      void this.worker?.terminate().catch(() => undefined)
    })
  }
}
