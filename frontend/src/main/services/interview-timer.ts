import { z } from 'zod'
import type { WalletState } from '../../shared/types'
import { environmentSnapshotSchema } from './interview-validation'
import { PlatformClient } from './platform-client'

const timestamp = z.string().datetime({ offset: true })
const backgroundSchema = z.object({ context: z.object({ name: z.string(), text: z.string().max(100_000) }), interviewTarget: z.object({ companyName: z.string(), roleName: z.string(), jobDescription: z.string().max(12_000) }), interviewEnvironment: environmentSnapshotSchema })
export const walletSchema = z.object({
  background: backgroundSchema.nullable().optional(),
  availableSeconds: z.number().int().nonnegative(), version: z.number().int().nonnegative(), serverTime: timestamp,
  session: z.object({ id: z.string(), status: z.enum(['active', 'ended']), startedAt: timestamp,
    expiresAt: timestamp, endedAt: timestamp.nullable(), usedSeconds: z.number().int().nonnegative(), endReason: z.string().nullable() }).nullable(),
})
interface Connection { baseUrl: string; token: string }
export class InterviewTimer {
  background: z.infer<typeof backgroundSchema> | null = null
  private state: WalletState | null = null
  private connection: Connection | null = null
  private deadline = 0
  private wallDeadline = 0
  private interval: ReturnType<typeof setInterval> | undefined
  private heartbeatPending = false
  private nextHeartbeat = 0
  private generation = 0
  private startId: string | null = null
  private pendingEnd: { connection: Connection; id: string } | null = null
  constructor(private readonly changed: (state: WalletState) => void, private readonly stopped: () => void) {}
  get sessionId(): string | undefined { return this.state?.session?.id }
  get active(): boolean { return Boolean(this.connection && this.state?.session?.status === 'active' && performance.now() < this.deadline && Date.now() < this.wallDeadline) }
  assertActive(): void { if (!this.active) throw new Error('请先开始面试；面试已结束或可用时长已耗尽。') }
  async read(connection: Connection): Promise<WalletState> { return this.request(connection, '/api/v1/wallet') }
  async start(connection: Connection, requestId: string, environmentId: string): Promise<WalletState> {
    if (this.active && this.startId === requestId && this.state) return this.state
    if (this.active) throw new Error('本次面试正在进行，请先结束面试。')
    const generation = this.generation
    const sent = performance.now()
    const state = await this.request(connection, '/api/v1/interview-sessions/start', { requestId, environmentId })
    if (generation !== this.generation) {
      if (state.session?.status === 'active') await this.request(connection, `/api/v1/interview-sessions/${encodeURIComponent(state.session.id)}/end`, {}).catch(() => undefined)
      throw new Error('本次开始操作已取消。')
    }
    const background = backgroundSchema.nullable().optional().parse(state.background)
    if (state.session?.status === 'active' && !background) {
      await this.request(connection, `/api/v1/interview-sessions/${encodeURIComponent(state.session.id)}/end`, {}).catch(() => undefined)
      throw new Error('服务器未返回面试背景快照，请更新后端后重试。')
    }
    this.background = background ?? null
    this.startId = requestId
    this.pendingEnd = null
    this.connection = connection
    this.accept(state, performance.now() - sent)
    if (!this.active) return state
    if (this.interval) clearInterval(this.interval)
    this.interval = setInterval(() => void this.tick(), 500)
    this.nextHeartbeat = performance.now() + 10_000
    return state
  }
  async end(): Promise<WalletState | null> {
    this.generation++
    if (this.connection && this.state?.session) this.pendingEnd = { connection: this.connection, id: this.state.session.id }
    const pending = this.pendingEnd
    this.clear()
    this.stopped()
    if (!pending) return this.state
    const state = await this.request(pending.connection, `/api/v1/interview-sessions/${encodeURIComponent(pending.id)}/end`, {})
    if (this.pendingEnd !== pending) return this.state
    this.pendingEnd = null
    this.state = state
    this.changed(state)
    return state
  }
  dispose(): void { void this.end().catch(() => undefined) }
  private clear(): void { this.background = null; this.connection = null; this.deadline = 0; this.wallDeadline = 0; if (this.interval) clearInterval(this.interval); this.interval = undefined }
  private accept(state: WalletState, roundTripMs = 0): void {
    this.state = state
    const remaining = Math.max(0, Date.parse(state.session?.expiresAt ?? state.serverTime) - Date.parse(state.serverTime) - roundTripMs)
    this.deadline = performance.now() + remaining
    this.wallDeadline = Date.now() + remaining
    this.changed(state)
    if (state.session?.status !== 'active' || !state.availableSeconds) { this.clear(); this.stopped() }
  }
  private async tick(): Promise<void> {
    if (!this.active) {
      const previous = this.state
      this.clear(); this.stopped()
      if (previous?.session) {
        const elapsed = Math.min(previous.availableSeconds, Math.max(0, Math.floor((Date.parse(previous.session.expiresAt) - Date.parse(previous.serverTime)) / 1000)))
        this.state = { ...previous, availableSeconds: previous.availableSeconds - elapsed, session: { ...previous.session, usedSeconds: previous.session.usedSeconds + elapsed, endedAt: previous.session.expiresAt, status: 'ended', endReason: 'connection_expired' } }
        this.changed(this.state)
      }
      return
    }
    if (this.heartbeatPending || performance.now() < this.nextHeartbeat) return
    const connection = this.connection
    const id = this.state?.session?.id
    if (!connection || !id) return
    this.heartbeatPending = true
    this.nextHeartbeat = performance.now() + 10_000
    const sent = performance.now()
    try {
      const state = await this.request(connection, `/api/v1/interview-sessions/${encodeURIComponent(id)}/heartbeat`, {})
      if (this.connection === connection && this.active) this.accept(state, performance.now() - sent)
    } catch { /* Keep the existing lease only; failures never extend it. */ }
    finally { this.heartbeatPending = false }
  }
  private async request(connection: Connection, path: string, body?: unknown): Promise<WalletState> {
    return walletSchema.parse(await new PlatformClient(connection.baseUrl).walletRequest(path, connection.token, body))
  }
}
