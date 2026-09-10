import { Worker } from 'node:worker_threads'
interface DocumentPage { number: number; text: string }

export interface ExtractedDocument { text: string; pages: DocumentPage[]; pageCount: number }

export function extractDocument(path: string, signal?: AbortSignal): Promise<ExtractedDocument> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./document-worker.mjs', import.meta.url), { workerData: { path } })
    let settled = false
    const finish = (error?: Error, value?: ExtractedDocument) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      worker.removeAllListeners()
      void worker.terminate().catch(() => undefined)
      if (error) reject(error)
      else if (value) resolve(value)
      else reject(new Error('文档解析没有返回有效结果。'))
    }
    const aborted = () => finish(new DOMException('文档解析已取消。', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('文档解析超时，请尝试更小的文件。')), 30_000)
    worker.once('message', (message: { value?: ExtractedDocument; error?: string }) => {
      finish(message.error ? new Error(message.error) : undefined, message.value)
    })
    worker.once('error', () => finish(new Error('文档解析进程启动失败，请重新导入。')))
    worker.once('exit', () => finish(new Error('文档解析进程提前结束。')))
    signal?.addEventListener('abort', aborted, { once: true })
    if (signal?.aborted) aborted()
  })
}
