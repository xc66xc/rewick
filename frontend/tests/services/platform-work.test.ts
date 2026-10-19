import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { PlatformWork } from '../../src/main/services/platform-work'
import { LlmClient } from '../../src/main/services/llm-client'
import { AsrClient } from '../../src/main/services/asr-client'
import { defaultSettings } from '../../src/shared/defaults'
import type { AppEvent } from '../../src/shared/types'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('platform work during account or endpoint changes', () => {
  it('blocks a delayed pre-change connection and all requests during overlapping identity changes', async () => {
    const work = new PlatformWork()
    const revision = work.revision
    let finishRead: (() => void) | undefined
    const read = new Promise<void>(resolve => { finishRead = resolve })
    const connect = vi.fn()
    const cancel = vi.fn()
    const pending = read.then(() => { work.track(revision, cancel); connect() })
    const finishLogout = work.beginChange()
    const finishLogin = work.beginChange()
    finishRead?.()
    await expect(pending).rejects.toThrow('已取消')
    expect(connect).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    expect(() => work.track(work.revision, vi.fn())).toThrow('已取消')
    finishLogout()
    expect(() => work.track(work.revision, vi.fn())).toThrow('已取消')
    finishLogin()
    expect(() => work.track(work.revision, cancel)).not.toThrow()
  })

  it('does not cancel completed work and cancellation can release its own registration', () => {
    const work = new PlatformWork()
    const done = vi.fn()
    work.track(work.revision, done)()
    let release: (() => void) | undefined
    const active = vi.fn(() => release?.())
    release = work.track(work.revision, active)
    const finish = work.beginChange()
    finish(); finish()
    expect(done).not.toHaveBeenCalled()
    expect(active).toHaveBeenCalledOnce()
  })

  it('cancels a held platform SSE immediately while a BYOK answer continues receiving text', async () => {
    const work = new PlatformWork()
    const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>()
    const encoder = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({ start(controller) {
        streams.set(url, controller)
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"开头"}}]}\n\n'))
        options.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true })
      } })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    }))
    const platformEvents: AppEvent[] = []
    const ownEvents: AppEvent[] = []
    const platform = new LlmClient({ ...defaultSettings, llm: { ...defaultSettings.llm, baseUrl: 'https://platform.example/api/v1/llm' } }, 'business-token', event => platformEvents.push(event), true)
    const direct = new LlmClient(defaultSettings, 'own-key', event => ownEvents.push(event))
    const release = work.track(work.revision, () => platform.cancel())
    const platformAnswer = platform.generate({ requestId: 'platform', question: '问题', transcript: '' }).finally(release)
    const ownAnswer = direct.generate({ requestId: 'own', question: '问题', transcript: '' })
    await vi.waitFor(() => expect(platformEvents.some(event => event.kind === 'answer-delta')).toBe(true))
    const finish = work.beginChange()
    await platformAnswer
    expect(platformEvents.at(-1)).toMatchObject({ kind: 'answer-done', cancelled: true })
    expect(ownEvents.some(event => event.kind === 'answer-done')).toBe(false)
    streams.get('https://api.deepseek.com/v1/chat/completions')?.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"继续回答"}}]}\n\ndata: [DONE]\n\n'))
    await ownAnswer
    expect(ownEvents.at(-1)).toMatchObject({ kind: 'answer-done', cancelled: false })
    expect(ownEvents).toContainEqual({ kind: 'answer-delta', requestId: 'own', delta: '继续回答' })
    finish()
  })

  it('cancels an in-flight platform model connection test', async () => {
    const work = new PlatformWork()
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    })))
    const release = work.track(work.revision, () => controller.abort(new Error('平台测试已取消')))
    const pending = new LlmClient(defaultSettings, 'business-token', () => undefined, true).test(controller.signal)
    const observed = expect(pending.finally(release)).rejects.toThrow('平台测试已取消')
    work.beginChange()()
    await observed
  })

  it('closes the platform ASR WebSocket while leaving a direct ASR connection able to send PCM', async () => {
    const work = new PlatformWork()
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test address')
    const peers = new Map<string, WebSocket>()
    const audio = new Map<string, number>()
    server.on('connection', (socket, request) => {
      const key = request.headers.authorization ?? ''
      peers.set(key, socket)
      socket.on('message', (raw, binary) => {
        if (binary) { audio.set(key, (audio.get(key) ?? 0) + 1); return }
        const frame = JSON.parse(raw.toString()) as { header: { action: string; task_id: string } }
        socket.send(JSON.stringify({ header: { task_id: frame.header.task_id, event: frame.header.action === 'run-task' ? 'task-started' : 'task-finished' } }))
      })
    })
    const config = { ...defaultSettings.asr, url: `ws://127.0.0.1:${address.port}` }
    const events: AppEvent[] = []
    const platform = new AsrClient(config, 'business-token', event => events.push(event))
    const own = new AsrClient(config, 'own-key', () => undefined)
    const release = work.track(work.revision, () => platform.dispose())
    try {
      const [platformSession, ownSession] = await Promise.all([platform.start(), own.start()])
      const finish = work.beginChange()
      await vi.waitFor(() => expect(peers.get('Bearer business-token')?.readyState).toBe(3))
      expect(events.at(-1)).toMatchObject({ kind: 'asr-status', status: 'idle', sessionId: platformSession.sessionId })
      platform.sendAudio(platformSession.sessionId, new Uint8Array([1, 2]).buffer)
      own.sendAudio(ownSession.sessionId, new Uint8Array([1, 2]).buffer)
      await vi.waitFor(() => expect(audio.get('Bearer own-key')).toBe(1))
      expect(audio.get('Bearer business-token')).toBeUndefined()
      await own.stop()
      finish()
    } finally {
      release(); platform.dispose(); own.dispose()
      for (const socket of server.clients) socket.terminate()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
