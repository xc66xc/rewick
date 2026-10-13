import type { OperationsTelemetry, OperationContext } from './operations-telemetry'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { websocketHttpsAgent } from './network-transport'
import { z } from 'zod'
import type { AppEvent, Settings } from '../../shared/types'
import { asrSettingsSchema, isLoopback, parseInput } from './validation'

interface Session {
  id: string
  started: number
  firstTranscript?: boolean
  audioBytes: number
  maxBacklog: number
  socket: WebSocket
  phase: 'connecting' | 'listening' | 'stopping'
  resolveStart?: (value: { sessionId: string }) => void
  rejectStart?: (error: Error) => void
  stopPromise?: Promise<void>
  resolveStop?: () => void
  rejectStop?: (error: Error) => void
  startupTimer?: ReturnType<typeof setTimeout>
  finishTimer?: ReturnType<typeof setTimeout>
  pingTimer?: ReturnType<typeof setInterval>
  alive: boolean
  finalized: Map<number, string>
  pending?: { id: string; starts: Set<number> }
}
const frameSchema = z.object({
  header: z.object({ task_id: z.string(), event: z.string(), error_code: z.string().optional() }),
  payload: z.unknown().optional(),
})
const resultSchema = z.object({
  output: z.object({ sentence: z.object({
    heartbeat: z.boolean().optional(), begin_time: z.number().int().nonnegative().optional(),
    end_time: z.number().int().nonnegative().nullable().optional(), text: z.string().max(100_000).optional(),
    sentence_end: z.boolean().optional(),
  }) }),
})

export class AsrClient {
  private active?: Session
  constructor(private readonly settings: Settings['asr'], private readonly apiKey: string, private readonly emit: (event: AppEvent) => void, private readonly telemetry?: OperationsTelemetry, private readonly observation?: OperationContext) {}

  async start(): Promise<{ sessionId: string }> {
    const config = parseInput(asrSettingsSchema, this.settings)
    if (!this.apiKey.trim() && !isLoopback(new URL(config.url).hostname)) throw new Error('请先在设置中填写阿里云语音转写 API Key。')
    this.dispose()
    const socket = new WebSocket(config.url, {
      agent: new URL(config.url).protocol === 'wss:' ? websocketHttpsAgent : undefined,
      headers: { ...(this.apiKey.trim() ? { Authorization: `Bearer ${this.apiKey.trim()}` } : {}), ...(this.observation?.serviceSource === 'platform' ? { 'X-Operation-Id': this.observation.operationId, 'X-Parent-Span-Id': this.observation.spanId } : {}) },
      handshakeTimeout: 15_000, maxPayload: 1_048_576, followRedirects: false,
    })
    const state: Session = { started: performance.now(), audioBytes: 0, maxBacklog: 0, id: randomUUID(), socket, phase: 'connecting', alive: true, finalized: new Map() }
    this.active = state
    const promise = new Promise<{ sessionId: string }>((resolve, reject) => {
      state.resolveStart = resolve
      state.rejectStart = reject
    })
    state.startupTimer = setTimeout(() => this.fail(state, '语音连接超时，请检查网络、转写地址和 API Key。'), 15_000)
    this.emit({ kind: 'asr-status', sessionId: state.id, status: 'connecting' })
    socket.on('open', () => {
      if (this.active !== state) return
      this.send(state, {
        header: { action: 'run-task', task_id: state.id, streaming: 'duplex' },
        payload: {
          task_group: 'audio', task: 'asr', function: 'recognition', model: config.model,
          parameters: { format: 'pcm', sample_rate: 16000, semantic_punctuation_enabled: false, max_sentence_silence: config.silenceMs, heartbeat: true },
          input: {},
        },
      })
      state.pingTimer = setInterval(() => {
        if (this.active !== state) return
        if (!state.alive) { this.fail(state, '语音连接已中断，请检查网络后重新开始。'); return }
        state.alive = false
        socket.ping(undefined, undefined, (error) => { if (error) this.fail(state, '语音连接心跳失败，请重新开始。') })
      }, 15_000)
    })
    socket.on('pong', () => { state.alive = true })
    socket.on('message', (data, isBinary) => {
      if (this.active !== state || isBinary) return
      let payload: unknown
      try { payload = JSON.parse(data.toString()) as unknown }
      catch { this.fail(state, '转写服务返回无效数据，请检查转写地址是否正确。'); return }
      this.handle(state, payload)
    })
    socket.on('error', () => this.fail(state, '无法连接转写服务，请检查网络、API Key 和服务地域。'))
    socket.on('close', () => this.fail(state, state.phase === 'stopping'
      ? '转写连接提前关闭，最后一句可能未完成。'
      : '转写连接已关闭，请检查网络或额度后重新开始。'))
    return promise
  }

  sendAudio(sessionId: string, audio: ArrayBuffer): void {
    const state = this.active
    if (!state || state.id !== sessionId || state.phase !== 'listening' || state.socket.readyState !== WebSocket.OPEN) return
    if (!(audio instanceof ArrayBuffer) || audio.byteLength === 0 || audio.byteLength > 65_536 || audio.byteLength % 2 !== 0) {
      this.fail(state, '音频数据格式无效，预期 16kHz 单声道 PCM16。')
      return
    }
    state.maxBacklog = Math.max(state.maxBacklog, state.socket.bufferedAmount + audio.byteLength)
    if (state.socket.bufferedAmount + audio.byteLength > 128_000) {
      this.fail(state, '音频发送积压，网络速度不足。请检查网络后重新开始。')
      return
    }
    state.audioBytes += audio.byteLength
    state.socket.send(Buffer.from(audio), { binary: true }, (error) => {
      if (error) this.fail(state, '音频发送失败，请重新开始转写。')
    })
  }

  stop(): Promise<void> {
    const state = this.active
    if (!state) return Promise.resolve()
    if (state.stopPromise) return state.stopPromise
    if (state.phase === 'connecting') {
      this.dispose()
      return Promise.resolve()
    }
    state.phase = 'stopping'
    state.stopPromise = new Promise<void>((resolve, reject) => { state.resolveStop = resolve; state.rejectStop = reject })
    this.emit({ kind: 'asr-status', sessionId: state.id, status: 'stopping' })
    state.finishTimer = setTimeout(() => this.fail(state, '等待转写结束超时，最后一句可能未完成。'), 8000)
    this.send(state, { header: { action: 'finish-task', task_id: state.id, streaming: 'duplex' }, payload: { input: {} } })
    return state.stopPromise
  }

  dispose(): void {
    const state = this.active
    if (!state) return
    state.rejectStart?.(new Error('语音连接已取消。'))
    state.resolveStop?.()
    this.reportComplete(state, 'cancelled')
    this.release(state)
    this.emit({ kind: 'asr-status', sessionId: state.id, status: 'idle' })
  }

  private handle(state: Session, payload: unknown): void {
    const parsed = frameSchema.safeParse(payload)
    if (!parsed.success) { this.fail(state, '转写服务响应格式不兼容，请检查服务地址。'); return }
    const { header } = parsed.data
    if (header.task_id !== state.id) return
    if (header.event === 'task-started' && state.phase === 'connecting') {
      clearTimeout(state.startupTimer)
      state.phase = 'listening'
      this.telemetry?.record(this.observation, 'asr.connect', state.started, 'success')
      state.resolveStart?.({ sessionId: state.id })
      state.resolveStart = undefined
      state.rejectStart = undefined
      this.emit({ kind: 'asr-status', sessionId: state.id, status: 'listening' })
    } else if (header.event === 'result-generated' && state.phase !== 'connecting') {
      const result = resultSchema.safeParse(parsed.data.payload)
      if (!result.success) { this.fail(state, '转写字幕格式不兼容，请检查模型名称。'); return }
      const sentence = result.data.output.sentence
      if (sentence.heartbeat || sentence.begin_time === undefined || !sentence.text?.trim()) return
      if (!state.firstTranscript) { state.firstTranscript = true; this.telemetry?.record(this.observation, 'asr.first_transcript', state.started, 'success') }
      const endMs = sentence.end_time !== null && sentence.end_time !== undefined && sentence.end_time >= sentence.begin_time
        ? sentence.end_time : undefined
      // Fun-ASR SDKs also mark completed sentences with end_time when sentence_end is absent.
      const isFinal = sentence.sentence_end ?? (endMs !== undefined)
      const completedId = state.finalized.get(sentence.begin_time)
      if (!isFinal && completedId !== undefined) return
      // Streaming timestamps can be corrected before finalization. Keep one identity
      // for the open sentence; completed revisions must not consume the next sentence.
      const current = completedId === undefined
        ? state.pending ?? { id: `${state.id}:${sentence.begin_time}`, starts: new Set<number>() }
        : undefined
      current?.starts.add(sentence.begin_time)
      const segmentId = completedId ?? current?.id
      if (segmentId === undefined) return
      if (isFinal && current) {
        for (const start of current.starts) state.finalized.set(start, segmentId)
        state.pending = undefined
      } else if (current) {
        state.pending = current
      }
      this.emit({
        kind: 'transcript', sessionId: state.id,
        segment: { id: segmentId, text: sentence.text, startMs: sentence.begin_time, endMs, isFinal },
      })
    } else if (header.event === 'task-finished') {
      if (state.phase === 'connecting') { this.fail(state, '转写任务未启动就结束，请检查模型及服务配置。'); return }
      state.resolveStop?.()
      this.reportComplete(state, 'success')
      this.release(state)
      this.emit({ kind: 'asr-status', sessionId: state.id, status: 'idle' })
    } else if (header.event === 'task-failed') {
      const authentication = /auth|denied|forbidden|invalidapikey/i.test(header.error_code ?? '')
      this.fail(state, authentication ? '转写认证失败，请检查 API Key、服务地域和模型权限。' : '转写服务返回错误，请重新开始转写；如反复出现，请联系管理员查看错误日志。')
    }
  }

  private send(state: Session, value: unknown): void {
    if (this.active !== state) return
    if (state.socket.readyState !== WebSocket.OPEN) { this.fail(state, '语音连接不可用，请重新开始。'); return }
    state.socket.send(JSON.stringify(value), (error) => { if (error) this.fail(state, '转写指令发送失败，请重新开始。') })
  }

  private fail(state: Session, message: string): void {
    if (this.active !== state) return
    this.reportComplete(state, 'error')
    state.rejectStart?.(new Error(message))
    state.rejectStop?.(new Error(message))
    this.release(state)
    this.emit({ kind: 'asr-status', sessionId: state.id, status: 'error', message })
  }

  private reportComplete(state: Session, outcome: 'success' | 'cancelled' | 'error'): void {
    if (state.phase === 'connecting') this.telemetry?.record(this.observation, 'asr.connect', state.started, outcome)
    this.telemetry?.record(this.observation, 'asr.complete', state.started, outcome, { audioBytes: state.audioBytes }, this.observation?.spanId)
    this.telemetry?.record(this.observation, 'asr.backlog', performance.now(), state.maxBacklog > 128000 ? 'rejected' : 'success', { bufferedBytes: state.maxBacklog })
  }

  private release(state: Session): void {
    clearTimeout(state.startupTimer)
    clearTimeout(state.finishTimer)
    clearInterval(state.pingTimer)
    if (this.active === state) this.active = undefined
    state.socket.removeAllListeners()
    // A CONNECTING socket can emit an asynchronous error when terminated.
    state.socket.on('error', () => undefined)
    if (state.socket.readyState === WebSocket.OPEN) {
      state.socket.close()
      const timer = setTimeout(() => state.socket.terminate(), 500)
      timer.unref()
      state.socket.once('close', () => clearTimeout(timer))
    } else if (state.socket.readyState !== WebSocket.CLOSED) { state.socket.terminate() }
  }
}
