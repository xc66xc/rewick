import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServerHistory } from '../../src/main/services/server-history'
import { defaultSettings } from '../../src/shared/defaults'
import type { Settings } from '../../src/shared/types'
let directory: string
const crypto = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')), decryptString: (b: Buffer) => b.toString().split('').reverse().join('') }
const auth = async () => ({ settings: { ...defaultSettings, platform: { ...defaultSettings.platform, baseUrl: 'https://example.test', authenticated: true } } as Settings, secrets: { platformAccessToken: 'token', asrApiKey: '', llmApiKey: '', remoteKnowledgeApiKey: '' } })
const record = { id: 'one', createdAt: '2026-09-12T10:00:00Z', title: '秘密面试内容', segments: [], answers: [] }
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'server-history-')) })
afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }) })
it('retries the same mutation after restart without persisting plaintext', async () => {
  const calls: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); throw new Error('offline') }))
  const history = new ServerHistory(directory, crypto, auth)
  await history.save(record)
  await vi.waitFor(() => expect(history.status()).toContain('offline'))
  expect(await readFile(join(directory, 'history-outbox.enc.json'), 'utf8')).not.toContain(record.title)
  const restarted = new ServerHistory(directory, crypto, auth)
  vi.stubGlobal('fetch', vi.fn(async (_: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); expect(body.mutationId).toBe(calls[0].mutationId); return Response.json({ version: 1, record: body.record }) }))
  await restarted.flush()
  expect(restarted.status()).toBe('已同步')
  const decoded = JSON.parse(crypto.decryptString(Buffer.from(JSON.parse(await readFile(join(directory, 'history-outbox.enc.json'), 'utf8')), 'base64')))
  expect(decoded.drafts).toEqual({})
})
it('preserves newer edits behind uncertain uploads', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  const history = new ServerHistory(directory, crypto, auth)
  await history.save(record)
  await vi.waitFor(() => expect(history.status()).toBe('offline'))
  await history.save({ ...record, title: '新内容' })
  await vi.waitFor(() => expect(history.status()).toBe('offline'))
  const bodies: { version: number; record: { title: string } }[] = []
  vi.stubGlobal('fetch', vi.fn(async (_: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); bodies.push(body); return Response.json({ version: body.version + 1, record: body.record }) }))
  await history.flush()
  expect(bodies.map(body => [body.version, body.record.title])).toEqual([[0, record.title], [1, '新内容']])
})
it('does not upload with a changed account', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  const history = new ServerHistory(directory, crypto, async () => { throw new Error('账户已切换') })
  await history.save(record)
  await vi.waitFor(() => expect(history.status()).toBe('账户已切换'))
  expect(fetcher).not.toHaveBeenCalled()
})
it('writes newer drafts immediately while an upload is waiting on the network', async () => {
  let release: () => void = () => undefined
  const stalled = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async (_: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    calls++
    if (calls === 1) await stalled
    return Response.json({ version: body.version + 1, record: body.record })
  }))
  const history = new ServerHistory(directory, crypto, auth)
  await history.save(record)
  await vi.waitFor(() => expect(calls).toBe(1))
  try {
    await history.save({ ...record, title: '网络等待时的新内容' })
    const journal = JSON.parse(crypto.decryptString(Buffer.from(JSON.parse(await readFile(join(directory, 'history-outbox.enc.json'), 'utf8')), 'base64')))
    expect(journal.drafts.one.next.title).toBe('网络等待时的新内容')
  } finally { release() }
  await vi.waitFor(() => expect(history.status()).toBe('已同步'))
  expect(calls).toBe(2)
})
it.each(['TimeoutError', 'AbortError'])('explains detail %s without exposing the transport exception', async name => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('transport timeout', name) }))
  const history = new ServerHistory(directory, crypto, auth)
  await expect(history.detail('one')).rejects.toThrow('会话详情加载超时，请检查网络后重试。服务器中的记录仍然保留。')
})
it('handles a timeout after the detail response headers have arrived', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
    start(controller) { controller.error(new DOMException('body timeout', 'AbortError')) }
  }))))
  const history = new ServerHistory(directory, crypto, auth)
  await expect(history.detail('one')).rejects.toThrow('会话详情加载超时')
})
