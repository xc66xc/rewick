import { AsyncLocalStorage } from 'node:async_hooks'
import { SerialQueue } from './storage'

interface WriterLease { active: boolean; revision: number }

/** Serialize disk mutations with a storage swap without serializing ordinary IPC. */
export class LocalStorageGate {
  private readonly queue = new SerialQueue()
  private readonly writer = new AsyncLocalStorage<WriterLease>()
  private epoch = 0
  private changing = false
  get revision(): number { return this.epoch }
  get migrating(): boolean { return this.changing }
  get inWriter(): boolean { return this.writer.getStore()?.active ?? false }

  assertCurrent(revision: number): void {
    if (this.changing) throw new Error('正在迁移本机数据，请稍后再操作。')
    if (revision !== this.epoch) throw new Error('本机存储已切换，旧操作已取消，请重新操作。')
  }

  async write<T>(revision: number, operation: () => Promise<T>): Promise<T> {
    const inherited = this.writer.getStore()
    // Session-fault cleanup can be awaited by a login/refresh writer. Let that
    // writer finish instead of queuing behind itself and deadlocking migration.
    if (inherited?.active) return operation()
    this.assertCurrent(revision)
    return this.queue.run(async () => {
      this.assertCurrent(revision)
      const lease = { active: true, revision }
      try { return await this.writer.run(lease, operation) }
      finally { lease.active = false }
    })
  }

  async migrate<T>(operation: () => Promise<T>): Promise<T> {
    if (this.changing) throw new Error('正在迁移本机数据，请稍后再试。')
    if (this.writer.getStore()?.active) throw new Error('本机设置正在保存，请完成后再迁移。')
    // Lock and invalidate queued/preflight writers synchronously, before waiting.
    this.changing = true
    this.epoch++
    try { return await this.queue.run(operation) }
    finally { this.changing = false }
  }
}
