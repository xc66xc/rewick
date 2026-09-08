import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { defaultSettings } from '../../src/shared/defaults'
import type { AppEvent } from '../../src/shared/types'
import { AsrClient } from '../../src/main/services/asr-client'

let server: WebSocketServer | undefined
let client: AsrClient | undefined
async function serve(onConnection: (socket: WebSocket) => void): Promise<string> {
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  server.on('connection', onConnection)
  await new Promise<void>((resolve) => server?.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test server address')
  return `ws://127.0.0.1:${address.port}`
}
function event(socket: WebSocket, taskId: string, name: string, payload: unknown = {}) {
  socket.send(JSON.stringify({ header: { task_id: taskId, event: name }, payload }))
}
function sentence(socket: WebSocket, taskId: string, values: Record<string, unknown>) {
  event(socket, taskId, 'result-generated', { output: { sentence: values } })
}
afterEach(async () => {
  client?.dispose()
  vi.useRealTimers()
  if (server) {
    for (const socket of server.clients) socket.terminate()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  server = undefined
})

describe('AsrClient', () => {
  it('finalizes Fun-ASR sentences with end_time but no sentence_end while listening and rejects later partial revisions', async () => {
    let peer: WebSocket | undefined
    const url = await serve((socket) => {
      peer = socket
      socket.on('message', (raw) => {
        const packet = JSON.parse(raw.toString()) as { header: { action: string; task_id: string } }
        if (packet.header.action !== 'run-task') return
        const taskId = packet.header.task_id
        event(socket, taskId, 'task-started')
        sentence(socket, taskId, { begin_time: 12410, end_time: null, text: '先简单自介' })
        sentence(socket, taskId, { begin_time: 12410, end_time: 15590, text: '先简单自介介绍一下自己。' })
      })
    })
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    const { sessionId } = await client.start()

    await vi.waitFor(() => expect(events.filter((value) => value.kind === 'transcript')).toHaveLength(2))
    const segments = events.filter((value) => value.kind === 'transcript').map((value) => value.segment)
    expect(segments[0]).toMatchObject({ isFinal: false, startMs: 12410 })
    expect(segments[1]).toEqual({
      id: `${sessionId}:12410`, text: '先简单自介介绍一下自己。', startMs: 12410, endMs: 15590, isFinal: true,
    })
    expect(events.filter((value) => value.kind === 'asr-status').at(-1)).toMatchObject({ status: 'listening' })

    if (!peer) throw new Error('No peer')
    sentence(peer, sessionId, { begin_time: 12410, end_time: null, text: '不应回退' })
    sentence(peer, sessionId, { begin_time: 16000, end_time: 17000, text: '心跳不是字幕', heartbeat: true })
    sentence(peer, sessionId, { begin_time: 18000, end_time: null, text: '下一句' })
    await vi.waitFor(() => expect(events.filter((value) => value.kind === 'transcript')).toHaveLength(3))
    expect(events.filter((value) => value.kind === 'transcript').at(-1)).toMatchObject({ segment: { text: '下一句', isFinal: false } })
  })

  it.each([
    { name: 'missing end_time', values: {}, isFinal: false, endMs: undefined },
    { name: 'null end_time', values: { end_time: null }, isFinal: false, endMs: undefined },
    { name: 'end_time before begin_time', values: { end_time: 50 }, isFinal: false, endMs: undefined },
    { name: 'explicit false with end_time', values: { sentence_end: false, end_time: 200 }, isFinal: false, endMs: 200 },
    { name: 'explicit true without end_time', values: { sentence_end: true }, isFinal: true, endMs: undefined },
    { name: 'zero end_time at zero begin_time', values: { begin_time: 0, end_time: 0 }, isFinal: true, endMs: 0 },
  ])('respects sentence finality for $name', async ({ values, isFinal, endMs }) => {
    const url = await serve((socket) => socket.on('message', (raw) => {
      const packet = JSON.parse(raw.toString()) as { header: { action: string; task_id: string } }
      if (packet.header.action !== 'run-task') return
      event(socket, packet.header.task_id, 'task-started')
      sentence(socket, packet.header.task_id, { begin_time: 100, text: '测试句子', ...values })
    }))
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    await client.start()

    await vi.waitFor(() => expect(events.filter((value) => value.kind === 'transcript')).toHaveLength(1))
    expect(events.find((value) => value.kind === 'transcript')).toMatchObject({ segment: { isFinal, endMs } })
  })

  it('waits for task-started, streams PCM, revises one segment, and drains the final sentence on stop', async () => {
    const receivedAudio: Buffer[] = []
    const actions: string[] = []
    let taskId = ''
    let peer: WebSocket | undefined
    let runTask: unknown
    let markRun: (() => void) | undefined
    const ran = new Promise<void>((resolve) => { markRun = resolve })
    const url = await serve((socket) => {
      peer = socket
      socket.on('message', (raw, binary) => {
        if (binary) { receivedAudio.push(Buffer.from(raw as Buffer)); return }
        const packet = JSON.parse(raw.toString()) as { header: { action: string; task_id: string } }
        actions.push(packet.header.action)
        if (packet.header.action === 'run-task') { taskId = packet.header.task_id; runTask = packet; markRun?.() }
        if (packet.header.action === 'finish-task') {
          sentence(socket, taskId, { begin_time: 1400, end_time: 1700, text: '最后一句', sentence_end: true })
          event(socket, taskId, 'task-finished')
        }
      })
    })
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    let started = false
    const startup = client.start().then((value) => { started = true; return value })
    await ran
    expect(started).toBe(false)
    client.sendAudio(taskId, new Int16Array([1, 2]).buffer)
    expect(receivedAudio).toHaveLength(0)
    expect(runTask).toMatchObject({ payload: { parameters: { format: 'pcm', sample_rate: 16000, heartbeat: true, max_sentence_silence: 800 } } })
    if (!peer) throw new Error('No peer')
    event(peer, taskId, 'task-started')
    expect(await startup).toEqual({ sessionId: taskId })
    client.sendAudio('stale-session', new Int16Array([9, 9]).buffer)
    client.sendAudio(taskId, new Int16Array([1, 2]).buffer)
    sentence(peer, taskId, { heartbeat: true })
    sentence(peer, 'stale-session', { begin_time: 0, text: '过期字幕', sentence_end: true })
    sentence(peer, taskId, { begin_time: 0, text: '缓存', end_time: null, sentence_end: false })
    sentence(peer, taskId, { begin_time: 0, end_time: 1200, text: '缓存一致性', sentence_end: true })
    sentence(peer, taskId, { begin_time: 0, text: '不应回退', sentence_end: false })
    await vi.waitFor(() => expect(events.filter((value) => value.kind === 'transcript')).toHaveLength(2))
    const segments = events.filter((value) => value.kind === 'transcript').map((value) => value.segment)
    expect(segments[0].id).toBe(`${taskId}:0`)
    expect(segments[1]).toMatchObject({ id: segments[0].id, text: '缓存一致性', isFinal: true, endMs: 1200 })
    await client.stop()
    expect(receivedAudio).toEqual([Buffer.from(new Int16Array([1, 2]).buffer)])
    expect(actions).toEqual(['run-task', 'finish-task'])
    expect(events.filter((value) => value.kind === 'transcript').at(-1)).toMatchObject({ segment: { text: '最后一句', isFinal: true } })
    expect(events.at(-1)).toEqual({ kind: 'asr-status', sessionId: taskId, status: 'idle' })
  })

  it('rejects failed startup without forwarding sensitive server error text', async () => {
    const url = await serve((socket) => socket.on('message', (raw) => {
      const packet = JSON.parse(raw.toString()) as { header: { task_id: string } }
      socket.send(JSON.stringify({ header: { task_id: packet.header.task_id, event: 'task-failed', error_code: 'InvalidApiKey', error_message: 'sensitive-provider-detail' } }))
    }))
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    await expect(client.start()).rejects.toThrow('认证失败')
    expect(events.filter((value) => value.kind === 'asr-status' && value.status === 'error')).toHaveLength(1)
    expect(JSON.stringify(events)).not.toContain('sensitive-provider-detail')
    await expect(client.stop()).resolves.toBeUndefined()
  })

  it('reports a disconnected session and can start a new one with independent segment ids', async () => {
    let count = 0
    const url = await serve((socket) => socket.on('message', (raw) => {
      const packet = JSON.parse(raw.toString()) as { header: { action: string; task_id: string } }
      if (packet.header.action !== 'run-task') return
      count += 1
      event(socket, packet.header.task_id, 'task-started')
      sentence(socket, packet.header.task_id, { begin_time: 0, text: `会话 ${count}`, sentence_end: true })
      if (count === 1) socket.close()
    }))
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    const first = await client.start()
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ kind: 'asr-status', status: 'error' }))
    const second = await client.start()
    await vi.waitFor(() => expect(events.filter((value) => value.kind === 'transcript')).toHaveLength(2))
    expect(second.sessionId).not.toBe(first.sessionId)
    const ids = events.filter((value) => value.kind === 'transcript').map((value) => value.segment.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('times out a server that never acknowledges run-task and cleans up the connection', async () => {
    let markRun: (() => void) | undefined
    const ran = new Promise<void>((resolve) => { markRun = resolve })
    const url = await serve((socket) => socket.on('message', () => markRun?.()))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    const rejected = expect(client.start()).rejects.toThrow('连接超时')
    await ran
    await vi.advanceTimersByTimeAsync(15_001)
    await rejected
    expect(events.at(-1)).toMatchObject({ kind: 'asr-status', status: 'error' })
    await expect(client.stop()).resolves.toBeUndefined()
  })

  it('cancels pending startup and allows a fresh session to connect', async () => {
    let count = 0
    let markRun: (() => void) | undefined
    const ran = new Promise<void>((resolve) => { markRun = resolve })
    const url = await serve((socket) => socket.on('message', (raw) => {
      const packet = JSON.parse(raw.toString()) as { header: { action: string; task_id: string } }
      if (packet.header.action !== 'run-task') return
      count += 1
      if (count === 1) markRun?.()
      else event(socket, packet.header.task_id, 'task-started')
    }))
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    const rejected = expect(client.start()).rejects.toThrow('连接已取消')
    await ran
    await client.stop()
    await rejected
    const second = await client.start()
    expect(events.at(-1)).toEqual({ kind: 'asr-status', sessionId: second.sessionId, status: 'listening' })
    expect(events.filter((value) => value.kind === 'asr-status' && value.status === 'listening')).toHaveLength(1)
  })

  it('times out finish-task instead of silently discarding an unfinished final sentence', async () => {
    const url = await serve((socket) => socket.on('message', (raw) => {
      const packet = JSON.parse(raw.toString()) as { header: { action: string; task_id: string } }
      if (packet.header.action === 'run-task') event(socket, packet.header.task_id, 'task-started')
    }))
    const events: AppEvent[] = []
    client = new AsrClient({ ...defaultSettings.asr, url }, '', (value) => events.push(value))
    await client.start()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const rejected = expect(client.stop()).rejects.toThrow('等待转写结束超时')
    await vi.advanceTimersByTimeAsync(8001)
    await rejected
    expect(events.at(-1)).toMatchObject({ kind: 'asr-status', status: 'error', message: expect.stringContaining('最后一句') })
  })
})
