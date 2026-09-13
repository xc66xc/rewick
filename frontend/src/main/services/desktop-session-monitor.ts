import { SessionFault } from './session-fault'
export interface SessionConnection { baseUrl: string; token: string }
interface Options {
  connection: () => Promise<SessionConnection | null>
  check: (connection: SessionConnection) => Promise<void>
  invalidated: (token: string, message: string) => Promise<void>
  paused: (token: string) => Promise<void>
  restored: () => void
}
/** Monitors the existing credential; never signs in using remembered passwords. */
export class DesktopSessionMonitor {
  private timer: ReturnType<typeof setInterval> | undefined
  private running: Promise<void> | undefined
  private token = ''
  private verifiedAt = -1
  private wallVerifiedAt = 0
  private paused = false
  private disposed = false
  constructor(private readonly options: Options) {}
  start() { this.disposed = false; if (!this.timer) this.timer = setInterval(() => { void this.check().catch(() => console.error('无法读取登录状态')) }, 5000); void this.check().catch(() => console.error('无法读取登录状态')) }
  dispose() { this.disposed = true; if (this.timer) clearInterval(this.timer); this.timer = undefined }
  assertVerified(token = this.token) {
    if (!this.token || token !== this.token || this.verifiedAt < 0 || this.paused || performance.now() - this.verifiedAt >= 30_000 || Date.now() - this.wallVerifiedAt >= 30_000) throw new Error('正在确认登录状态，请检查网络后重试。')
  }
  async ensureVerified() {
    await this.check()
    const connection = await this.options.connection()
    if (connection && connection.token !== this.token) await this.check()
    this.assertVerified(connection?.token ?? '')
  }
  check(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (!this.running) this.running = this.performCheck().finally(() => { this.running = undefined })
    return this.running
  }
  private async performCheck() {
    let token = ''
    try {
      const connection = await this.options.connection()
      if (!connection) { this.token = ''; this.verifiedAt = -1; return }
      token = connection.token
      if (token !== this.token) { this.token = token; this.verifiedAt = -1; this.wallVerifiedAt = 0 }
      await this.options.check(connection)
      if (this.disposed || (await this.options.connection())?.token !== token) return
      this.verifiedAt = performance.now(); this.wallVerifiedAt = Date.now()
      if (this.paused) { this.paused = false; this.options.restored() }
    } catch (error) {
      if (this.disposed || !token || (await this.options.connection())?.token !== token) return
      if (error instanceof SessionFault) await this.options.invalidated(token, error.message)
      else if (!this.paused && (this.verifiedAt < 0 || performance.now() - this.verifiedAt >= 30_000 || Date.now() - this.wallVerifiedAt >= 30_000)) {
        this.paused = true
        await this.options.paused(token)
      }
    }
  }
}
