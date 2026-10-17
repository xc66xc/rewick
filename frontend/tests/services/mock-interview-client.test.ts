import http from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { MockInterviewClient } from '../../src/main/services/mock-interview-client'
import { encodeMockAudio } from '../../src/shared/mock-interview'
const id = '12345678-1234-4234-8234-123456789012'
let server: http.Server, wss: WebSocketServer, baseUrl: string
const response = { enabled: true, voices: [{ id: 'voice', name: '声音' }], avatars: [{ id: 'rewick-interviewer', name: '面试官' }], durations: [15, 30, 45] }
const request = vi.fn()
beforeEach(async () => {
  request.mockReset()
  server = http.createServer((req, res) => {
    request(req.url, req.headers.authorization, req.method)
    if (req.url === '/api/v1/mock-interviews/capabilities') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(response)); return }
    if (req.url === '/api/v1/mock-wallet') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ availableSeconds: 900, version: 1 })); return }
    res.writeHead(403); res.end(JSON.stringify({ apiKey: 'private-provider-key-never-expose' }))
  })
  wss = new WebSocketServer({ server })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test server port')
  baseUrl = `http://127.0.0.1:${address.port}`
})
afterEach(async () => { for (const socket of wss.clients) socket.terminate(); await new Promise<void>(resolve => wss.close(() => resolve())); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
describe('authenticated mock interview main transport', () => {
  it('only fetches allowed platform endpoints with bearer credentials', async () => {
    const client = new MockInterviewClient(async () => ({ baseUrl, token: 'local-test-token' }), vi.fn())
    expect(await client.request('capabilities')).toEqual(response)
    expect(request).toHaveBeenCalledWith('/api/v1/mock-interviews/capabilities', 'Bearer local-test-token', 'GET')
    await expect(client.request('https://evil.example')).rejects.toThrow('不支持')
    await expect(client.request('get', { id: '../other-user' })).rejects.toThrow()
    client.disconnect()
  })
  it('does not expose supplier error bodies to renderer', async () => {
    const client = new MockInterviewClient(async () => ({ baseUrl, token: 'local-test-token' }), vi.fn())
    await expect(client.request('list')).rejects.toThrow('当前账号暂未获得模拟面试权限')
    client.disconnect()
  })
  it('rejects account changes while resolving credentials before any HTTP request', async () => {
    let release: ((value: { baseUrl: string; token: string }) => void) | undefined
    const connection = new Promise<{ baseUrl: string; token: string }>(resolve => { release = resolve })
    const client = new MockInterviewClient(() => connection, vi.fn())
    const pending = client.request('wallet'); client.disconnect(); release?.({ baseUrl, token: 'old-account' })
    await expect(pending).rejects.toThrow('账号已切换'); expect(request).not.toHaveBeenCalled()
  })
  it('carries bearer only in websocket headers and sends bounded binary mic frames and scoped credit', async () => {
    const frames: Buffer[] = []; const json: unknown[] = []; let path = ''; let authorization: string | undefined
    wss.on('connection', (socket, req) => { path = req.url ?? ''; authorization = req.headers.authorization; socket.on('message', (value, binary) => { if (binary) frames.push(Buffer.from(value as Buffer)); else json.push(JSON.parse(value.toString())) }) })
    const client = new MockInterviewClient(async () => ({ baseUrl, token: 'local-test-token' }), vi.fn())
    await client.connect(id)
    client.sendAudio(encodeMockAudio(0, 2, id, 0, new ArrayBuffer(3200))); client.credit({ bytes: 96000, speechId: id, generation: 2 })
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    expect(path).toBe(`/ws/v1/mock-interviews/${id}`); expect(authorization).toBe('Bearer local-test-token')
    expect(json).toContainEqual({ kind: 'playback.credit', bytes: 96000, speechId: id, generation: 2 })
    expect(() => client.sendAudio(new ArrayBuffer(100000))).toThrow('音频帧无效')
    client.disconnect()
  })
  it('heartbeats the websocket independently of REST and clears the timer on disconnect', async () => {
    const events: unknown[] = []
    wss.on('connection', socket => socket.on('message', data => events.push(JSON.parse(data.toString()))))
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const client = new MockInterviewClient(async () => ({ baseUrl, token: 'local-test-token' }), vi.fn())
    try {
      await client.connect(id)
      vi.advanceTimersByTime(10000)
      vi.useRealTimers()
      await vi.waitFor(() => expect(events).toContainEqual({ kind: 'heartbeat' }))
      client.disconnect()
    } finally { client.disconnect(); vi.useRealTimers() }
  })
  it('disconnects on malformed websocket data without forwarding it', async () => {
    const notify = vi.fn(); wss.on('connection', socket => { setTimeout(() => socket.send('invalid-json'), 10) })
    const client = new MockInterviewClient(async () => ({ baseUrl, token: 'local-test-token' }), notify)
    await client.connect(id)
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith({ kind: 'disconnected', message: expect.stringContaining('协议数据无效') }))
    expect(notify.mock.calls.some(call => call[0].kind === 'event')).toBe(false)
    client.disconnect()
  })
})
