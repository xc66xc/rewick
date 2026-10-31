import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { telemetryEventSchema, type TelemetryEvent, type TelemetryStage, type TelemetryMetadata } from '../../shared/telemetry'
import { PlatformClient } from './platform-client'

interface Identity { accountId: string; baseUrl: string; token: string }
interface Queued { event: TelemetryEvent; serialized: string; bytes: number; created: number; attempts: number }
export interface OperationContext { operationId: string; spanId: string; parentSpanId?: string; requestId?: string; sessionId?: string; accountId: string; generation: number; started: number; startedAt: string; model?: string; serviceSource?: 'platform' | 'custom'; providerType: TelemetryEvent['providerType'] }
let activeTelemetry: OperationsTelemetry | undefined
export function operationsTelemetry(): OperationsTelemetry | undefined { return activeTelemetry }
const context = new AsyncLocalStorage<OperationContext>()
export function operationHeaders(): Record<string, string> {
  const value = context.getStore()
  return value ? { 'X-Operation-Id': value.operationId, 'X-Parent-Span-Id': value.spanId } : {}
}
export class OperationsTelemetry {
  private identity?: Identity
  private generation = 0
  private enabled = false
  private queue: Queued[] = []
  private bytes = 0
  private dropped = 0
  private droppedTotal = 0
  private inFlightCount = 0
  private inFlightBytes = 0
  private recent = new Map<string, { operation: OperationContext; created: number }>()
  private flushScheduled = false
  private retryAfter = 0
  private flushing = false
  private controller?: AbortController
  private readonly timers: ReturnType<typeof setInterval>[] = []
  constructor(private readonly connection: () => Promise<Identity | undefined>, private readonly appVersion: string) { activeTelemetry = this }
  diagnostics() { return { queueSize: this.queue.length + this.inFlightCount, queueBytes: this.bytes + this.inFlightBytes, dropped: this.droppedTotal, enabled: this.enabled } }
  isEnabled(): boolean { return this.enabled }
  start(): void {
    void this.refresh()
    this.timers.push(setInterval(() => { void this.refresh() }, 60000), setInterval(() => { void this.flush() }, 10000))
    this.timers.forEach(timer => timer.unref())
  }
  dispose(): void { this.timers.forEach(clearInterval); this.reset(true); this.identity = undefined }
  private drop(count = 1): void { this.dropped += count; this.droppedTotal += count }
  reset(clearReportedDrops = false): void { this.recent.clear(); this.retryAfter = 0; this.generation++; this.drop(this.queue.length + this.inFlightCount); if (clearReportedDrops) this.dropped = 0; this.queue = []; this.bytes = 0; this.inFlightCount = 0; this.inFlightBytes = 0; this.enabled = false; this.controller?.abort() }
  async refresh(): Promise<void> {
    try {
      const next = await this.connection()
      if (next?.accountId !== this.identity?.accountId || next?.token !== this.identity?.token || next?.baseUrl !== this.identity?.baseUrl) { this.reset(true); this.identity = next }
      if (!next) return
      const identity = this.identity
      const response = await new PlatformClient(next.baseUrl, 2000).telemetrySettings(next.token)
      if (this.identity !== identity) return
      this.enabled = response.enabled === true
      if (!this.enabled) this.reset()
    } catch { this.reset() }
  }
  operation(input: Pick<OperationContext, 'operationId' | 'requestId' | 'sessionId'> & Partial<Pick<OperationContext, 'providerType' | 'model' | 'serviceSource'>>): OperationContext | undefined {
    if (!this.enabled || !this.identity) return
    const operation = { ...input, spanId: randomUUID(), accountId: this.identity.accountId, generation: this.generation, started: performance.now(), startedAt: new Date().toISOString(), providerType: input.providerType ?? 'system' }
    if (input.requestId) {
      this.pruneRecent()
      if (this.recent.size >= 128) { const oldest = this.recent.keys().next().value; if (oldest) this.recent.delete(oldest) }
      this.recent.set(input.requestId, { operation, created: Date.now() })
    }
    return operation
  }
  private pruneRecent(): void { for (const [key, value] of this.recent) if (Date.now() - value.created > 600000) this.recent.delete(key) }
  forRequest(requestId: string | undefined, sessionId?: string): OperationContext | undefined {
    this.pruneRecent()
    const value = requestId ? this.recent.get(requestId)?.operation : undefined
    return value && this.enabled && value.generation === this.generation && value.accountId === this.identity?.accountId && (!sessionId || sessionId === value.sessionId) ? value : undefined
  }
  private scheduleFlush(): void {
    if (this.queue.length < 64 || this.flushing || this.flushScheduled || Date.now() < this.retryAfter) return
    this.flushScheduled = true
    setImmediate(() => { this.flushScheduled = false; void this.flush() })
  }
  run<T>(operation: OperationContext | undefined, action: () => T): T { return operation ? context.run(operation, action) : action() }
  record(operation: OperationContext | undefined, stage: TelemetryStage, started: number, outcome: TelemetryEvent['outcome'], metadata?: TelemetryMetadata, spanId?: string, reason?: TelemetryEvent['reason']): void {
    if (!operation || !this.enabled || operation.generation !== this.generation || this.identity?.accountId !== operation.accountId) return
    const now = performance.now()
    this.enqueueTrusted({ eventId: randomUUID(), operationId: operation.operationId, spanId: spanId ?? randomUUID(), parentSpanId: spanId ? operation.parentSpanId : operation.spanId,
      requestId: operation.requestId, sessionId: operation.sessionId, stage, source: 'desktop', startedAt: new Date(Date.parse(operation.startedAt) + (started - operation.started)).toISOString(),
      offsetMs: Math.max(0, started - operation.started), durationMs: Math.min(86400000, Math.max(0, now - started)), outcome, reason,
      providerType: operation.providerType, model: operation.model, serviceSource: operation.serviceSource, appVersion: this.appVersion, metadata })
  }
  async measure<T>(operation: OperationContext | undefined, stage: TelemetryStage, action: () => Promise<T>, providerType?: OperationContext['providerType'], serviceSource?: OperationContext['serviceSource']): Promise<T> {
    const child = operation && { ...operation, parentSpanId: operation.spanId, spanId: randomUUID(), providerType: providerType ?? operation.providerType, serviceSource: serviceSource ?? operation.serviceSource }
    // The desktop measures the platform request; only the backend knows the selected search supplier.
    if (child && stage === 'retrieval.web') { child.providerType = 'system'; delete child.model }
    const started = performance.now()
    try {
      const value = await this.run(child, action)
      const retrieval = value as { status?: string; excerpts?: { generatedSummary?: boolean }[] }
      const outcome = retrieval?.status === 'degraded' ? 'degraded' : retrieval?.status === 'empty' ? 'empty' : retrieval?.status === 'disabled' ? 'skipped' : 'success'
      this.record(child, stage, started, outcome, retrieval?.excerpts ? { fragmentCount: retrieval.excerpts.length, summaryEnabled: retrieval.excerpts.some(item => item.generatedSummary) } : undefined, child?.spanId)
      return value
    } catch (error) {
      const reason = error instanceof Error && 'reason' in error && (error.reason === 'record_changed' || error.reason === 'record_deleted') ? error.reason : undefined
      this.record(child, stage, started, error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'error', undefined, child?.spanId, reason)
      throw error
    }
  }
  enqueue(event: unknown): void {
    if (!this.enabled || !this.identity) return
    const parsed = telemetryEventSchema.safeParse(event)
    if (!parsed.success) return
    parsed.data.appVersion = this.appVersion
    this.enqueueTrusted(parsed.data)
  }
  private enqueueTrusted(event: TelemetryEvent): void {
    const serialized = JSON.stringify(event)
    const bytes = Buffer.byteLength(serialized)
    if (bytes > 262144) { this.drop(); return }
    while (this.queue.length + this.inFlightCount >= 200 || this.bytes + this.inFlightBytes + bytes > 2097152) { const old = this.queue.shift(); if (!old) break; this.bytes -= old.bytes; this.drop() }
    if (this.queue.length + this.inFlightCount >= 200 || this.bytes + this.inFlightBytes + bytes > 2097152) { this.drop(); return }
    this.queue.push({ event, serialized, bytes, created: Date.now(), attempts: 0 }); this.bytes += bytes
    this.scheduleFlush()
  }
  async flush(): Promise<void> {
    if (this.flushing || !this.enabled || !this.identity || Date.now() < this.retryAfter) return
    this.flushing = true
    const identity = this.identity
    const generation = this.generation
    const batch: Queued[] = []
    let bytes = 128
    while (this.queue.length && batch.length < 64) {
      const item = this.queue[0]
      if (Date.now() - item.created > 120000) { this.queue.shift(); this.bytes -= item.bytes; this.drop(); continue }
      if (bytes + item.bytes + 1 > 262144) break
      this.queue.shift(); this.bytes -= item.bytes; bytes += item.bytes + 1; batch.push(item)
    }
    this.inFlightCount = batch.length
    this.inFlightBytes = bytes - 128
    const dropped = this.dropped
    this.controller = new AbortController()
    try {
      if (!batch.length && !dropped) return
      const payload = `{"events":[${batch.map(item => item.serialized).join(',')}],"droppedCount":${dropped}}`
      await new PlatformClient(identity.baseUrl, 2000).telemetryBatch(identity.token, payload, this.controller.signal)
      if (this.identity === identity) this.dropped = Math.max(0, this.dropped - dropped)
    } catch {
      this.retryAfter = Date.now() + 10000
      this.inFlightCount = 0; this.inFlightBytes = 0
      if (this.identity === identity && this.generation === generation && this.enabled) for (const item of batch) {
        if (item.attempts >= 2 || Date.now() - item.created > 120000 || this.queue.length >= 200 || this.bytes + item.bytes > 2097152) this.drop()
        else { item.attempts++; this.queue.push(item); this.bytes += item.bytes }
      }
      this.queue.sort((left, right) => left.created - right.created)
    } finally { this.inFlightCount = 0; this.inFlightBytes = 0; this.flushing = false; this.controller = undefined; this.scheduleFlush() }
  }
}
