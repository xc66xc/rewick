import WebSocket from 'ws'
import { z } from 'zod'
import { assertPlatformTransport } from '../../shared/platform-transport'
import { decodeMockAudio, mockCapabilitiesSchema, mockCommandSchema, mockCreateSchema, mockEventSchema, mockReportSchema, mockSessionSchema, mockWalletSchema, type MockMessage } from '../../shared/mock-interview'

interface Connection { baseUrl: string; token: string }
export class MockInterviewClient {
  private socket?: WebSocket
  private epoch = 0
  private sessionId?: string
  private heartbeat?: ReturnType<typeof setInterval>
  private controllers = new Set<AbortController>()
  constructor(private readonly connection: () => Promise<Connection>, private readonly notify: (message: MockMessage) => void) {}
  async request(action: string, input?: unknown): Promise<unknown> {
    const idInput = z.object({ id: z.string().uuid() })
    let path = '/api/v1/mock-interviews'; let method = 'GET'; let body: unknown
    switch (action) {
      case 'capabilities': path += '/capabilities'; break
      case 'wallet': path = '/api/v1/mock-wallet'; break
      case 'ledger': path = '/api/v1/mock-wallet/ledger'; break
      case 'list': break
      case 'create': method = 'POST'; body = mockCreateSchema.parse(input); break
      case 'get': path += `/${idInput.parse(input).id}`; break
      case 'command': { const value = z.object({ id: z.string().uuid(), command: mockCommandSchema }).parse(input); path += `/${value.id}/commands`; method = 'POST'; body = value.command; break }
      case 'report': path += `/${idInput.parse(input).id}/report`; break
      case 'retryReport': { const value = z.object({ id: z.string().uuid(), requestId: z.string().uuid() }).parse(input); path += `/${value.id}/report-retry`; method = 'POST'; body = { requestId: value.requestId }; break }
      case 'remove': path += `/${idInput.parse(input).id}`; method = 'DELETE'; break
      default: throw new Error('不支持的模拟面试操作。')
    }
    const epoch = this.epoch; const { baseUrl, token } = await this.connection(); assertPlatformTransport(baseUrl)
    if (epoch !== this.epoch) throw new Error('账号已切换，模拟操作已取消。')
    const controller = new AbortController(); this.controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), action === 'create' || action === 'command' ? 90000 : 30000)
    try {
      const response = await fetch(`${baseUrl}${path}`, { method, signal: controller.signal, redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      if (!response.ok) {
        await response.body?.cancel()
        const messages: Record<number, string> = { 401: '登录已失效，请重新登录。', 402: '模拟时长不足，请联系管理员发放独立模拟时长。', 403: '当前账号暂未获得模拟面试权限。', 404: '模拟面试服务尚未部署或会话不存在。', 409: '会话状态已变化，请刷新后重试；如有辅助面试，请先结束。', 429: '模拟面试并发或次数已达限制，请稍后重试。', 503: '模拟面试尚未开放或服务配置不完整，请联系管理员。' }
        throw new Error(messages[response.status] ?? `模拟面试请求失败（HTTP ${response.status}）。`)
      }
      const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = []
      if (reader) { try { while (true) { const value = await reader.read(); if (value.done) break; size += value.value.byteLength; if (size > 2_097_152) throw new Error('模拟面试响应超出容量限制。'); chunks.push(value.value) } } finally { await reader.cancel(); reader.releaseLock() } }
      if (epoch !== this.epoch) throw new Error('账号已切换，模拟操作已取消。')
      const value: unknown = size ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
      if (action === 'capabilities') return mockCapabilitiesSchema.parse(value)
      if (action === 'wallet') return mockWalletSchema.parse(value)
      if (action === 'list') return z.object({ items: z.array(mockSessionSchema) }).parse(value)
      if (action === 'report' || action === 'retryReport') return mockReportSchema.parse(value)
      if (action === 'ledger') return z.object({ items: z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String), deltaSeconds: z.number(), balanceAfterSeconds: z.number(), reason: z.string(), createdAt: z.string() })) }).parse(value)
      if (action === 'remove') return z.object({ deleted: z.boolean() }).parse(value)
      return mockSessionSchema.parse(value)
    } catch (error) {
      if (controller.signal.aborted) throw new Error(epoch !== this.epoch ? '账号已切换，模拟操作已取消。' : '模拟面试请求超时，请检查网络后重试。')
      throw error
    } finally { clearTimeout(timer); this.controllers.delete(controller) }
  }
  async connect(id: unknown) {
    const sessionId = z.string().uuid().parse(id)
    this.disconnect(); const epoch = this.epoch
    const { baseUrl, token } = await this.connection()
    if (epoch !== this.epoch) throw new Error('模拟连接已取消。')
    assertPlatformTransport(baseUrl)
    const url = new URL(`/ws/v1/mock-interviews/${sessionId}`, baseUrl); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` }, maxPayload: 1_048_576, handshakeTimeout: 10000, followRedirects: false })
    this.socket = socket; this.sessionId = sessionId
    const valid = () => this.socket === socket && epoch === this.epoch
    socket.on('message', (raw, binary) => {
      if (!valid()) return
      try {
        const data = Buffer.isBuffer(raw) ? raw : Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw)])
        if (binary) { const frame = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer; if (decodeMockAudio(frame).direction !== 1) throw new Error('无效音频方向。'); this.notify({ kind: 'audio', frame }) }
        else { const event = mockEventSchema.parse(JSON.parse(data.toString())); if (event.sessionId === sessionId) this.notify({ kind: 'event', event }) }
      } catch { this.notify({ kind: 'disconnected', message: '模拟面试协议数据无效，已停止连接。' }); this.disconnect() }
    })
    socket.on('close', () => { if (valid()) { if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = undefined; this.socket = undefined; this.notify({ kind: 'disconnected', message: '模拟面试连接已断开，服务端将暂停计时，请重新连接。' }) } })
    socket.on('error', () => { if (valid()) this.notify({ kind: 'disconnected', message: '模拟面试连接失败，请检查网络后重试。' }) })
    await new Promise<void>((resolve, reject) => { socket.once('open', () => { if (!valid()) { reject(new Error('连接已取消。')); return }; socket.send(JSON.stringify({ kind: 'connect' })); this.heartbeat = setInterval(() => { if (valid() && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ kind: 'heartbeat' })) }, 10000); resolve() }); socket.once('error', () => reject(new Error('模拟面试连接失败。'))); socket.once('close', () => reject(new Error('模拟面试连接已关闭。'))) })
  }
  sendAudio(input: unknown) {
    if (!(input instanceof ArrayBuffer)) return
    const audio = decodeMockAudio(input)
    if (audio.direction !== 0 || !this.sessionId || this.socket?.readyState !== WebSocket.OPEN) return
    if (this.socket.bufferedAmount > 64000) { this.notify({ kind: 'disconnected', message: '音频发送积压，模拟面试已断开。' }); this.disconnect(); return }
    this.socket.send(input)
  }
  credit(input: unknown) { const value = z.object({ bytes: z.number().int().min(1).max(96000), speechId: z.string().uuid(), generation: z.number().int().nonnegative() }).parse(input); if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ kind: 'playback.credit', ...value })) }
  disconnect() { if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = undefined; this.epoch++; const socket = this.socket; this.socket = undefined; this.sessionId = undefined; socket?.close(); for (const controller of this.controllers) controller.abort(); this.controllers.clear() }
}
