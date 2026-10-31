import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServerHistory } from '../../src/main/services/server-history'
import { defaultSettings } from '../../src/shared/defaults'
import type { Settings } from '../../src/shared/types'
let directory: string
const crypto = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')), decryptString: (b: Buffer) => b.toString().split('').reverse().join('') }
const auth = async () => ({ settings: { ...defaultSettings, platform: { ...defaultSettings.platform, baseUrl: 'https://example.test', authenticated: true } } as Settings, secrets: { platformAccessToken: 'token', asrApiKey: '', llmApiKey: '', } })
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
  await restarted.retryDraft('one')
  expect(restarted.status()).toBe('已同步')
  const decoded = JSON.parse(crypto.decryptString(Buffer.from(JSON.parse(await readFile(join(directory, 'history-outbox.enc.json'), 'utf8')), 'base64')))
  expect(decoded.drafts).toEqual({})
})
it('preserves newer edits behind uncertain uploads', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  const history = new ServerHistory(directory, crypto, auth)
  await history.save(record)
  await vi.waitFor(() => expect(history.status()).toBe('offline'))
  await history.saveDraft({ ...record, title: '新内容' })
  const bodies: { version: number; record: { title: string } }[] = []
  vi.stubGlobal('fetch', vi.fn(async (_: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); bodies.push(body); return Response.json({ version: body.version + 1, record: body.record }) }))
  await history.retryDraft('one')
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

it.each([409, 410])('blocks permanent %s conflicts across restart and later edits without blocking other records', async status => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    return body.record.id === 'one' ? new Response('', { status }) : Response.json({ version: 1, record: body.record })
  })
  vi.stubGlobal('fetch', fetcher)
  const history = new ServerHistory(directory, crypto, auth)
  await history.saveDraft(record)
  await expect(history.flush()).rejects.toThrow('本地草稿已保留')
  const restarted = new ServerHistory(directory, crypto, auth)
  await restarted.saveDraft({ ...record, title: 'later local edit' })
  await restarted.saveDraft({ ...record, id: 'two' })
  await restarted.flush()
  await restarted.flush()
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(await restarted.drafts()).toEqual([expect.objectContaining({ id: 'one', title: 'later local edit', reason: status === 409 ? 'record_changed' : 'record_deleted' })])
  expect(restarted.status()).toContain('待处理')
  expect((await restarted.localDraft('one')).title).toBe('later local edit')
})
it('bounds transient retries, retains a stable mutation, and does not immediately retry edits', async () => {
  let now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
  const bodies: { mutationId: string }[] = []
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); throw new Error('offline') })
  vi.stubGlobal('fetch', fetcher)
  try {
    const history = new ServerHistory(directory, crypto, auth)
    await history.saveDraft(record)
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(history.flush()).rejects.toThrow('offline')
      await history.saveDraft({ ...record, title: `edit ${attempt}` })
      await history.flush()
      expect(fetcher).toHaveBeenCalledTimes(attempt + 1)
      now += 300001
    }
    const restarted = new ServerHistory(directory, crypto, auth)
    await restarted.flush()
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(new Set(bodies.map(body => body.mutationId)).size).toBe(1)
    expect((await restarted.drafts())[0].reason).toBe('retry_limit')
  } finally { clock.mockRestore() }
})
it('recovers through a persisted new id after a lost response without deleting the original draft early', async () => {
  const history = new ServerHistory(directory, crypto, auth)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 410 })))
  await history.saveDraft(record)
  await expect(history.flush()).rejects.toThrow()
  await history.saveDraft({ ...record, title: 'latest local content' })
  const copies: { record: typeof record; version: number; mutationId: string }[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { copies.push(JSON.parse(String(init.body))); throw new Error('response lost') }))
  await expect(history.recoverDraft('one')).rejects.toThrow('response lost')
  expect((await history.localDraft('one')).title).toBe('latest local content')
  const restarted = new ServerHistory(directory, crypto, auth)
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); copies.push(body)
    return Response.json({ version: 1, record: body.record })
  }))
  const [id, sameId] = await Promise.all([restarted.recoverDraft('one'), restarted.recoverDraft('one')])
  expect(id).toBe(sameId)
  expect(id).not.toBe('one')
  expect(copies).toHaveLength(2)
  expect(copies[1]).toEqual(copies[0])
  expect(copies[0].version).toBe(0)
  expect(copies[0].record.title).toContain('latest local content')
  expect(await restarted.drafts()).toEqual([])
  await expect(restarted.localDraft('one')).rejects.toThrow('不存在')
  expect(restarted.status()).toBe('已同步')
})
it('retains edits made while a recovered copy uploads', async () => {
  const history = new ServerHistory(directory, crypto, auth)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 409 })))
  await history.saveDraft(record)
  await expect(history.flush()).rejects.toThrow()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let uploading = false
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); uploading = true; await gate
    return Response.json({ version: 1, record: body.record })
  }))
  const recovery = history.recoverDraft('one')
  await vi.waitFor(() => expect(uploading).toBe(true))
  await history.saveDraft({ ...record, title: 'changed during recovery' })
  release(); await recovery
  expect((await history.localDraft('one')).title).toBe('changed during recovery')
  expect((await history.drafts())[0].reason).toBe('record_changed')
})

it('reports successful recovery even when an unrelated draft in the same flush fails', async () => {
  const history = new ServerHistory(directory, crypto, auth)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 409 })))
  await history.saveDraft(record)
  await expect(history.flush()).rejects.toThrow()
  await history.saveDraft({ ...record, id: 'unrelated' })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (body.record.id === 'unrelated') throw new Error('unrelated offline')
    return Response.json({ version: 1, record: body.record })
  }))
  await expect(history.recoverDraft('one')).resolves.not.toBe('one')
  await expect(history.localDraft('one')).rejects.toThrow('不存在')
  expect((await history.localDraft('unrelated')).id).toBe('unrelated')
  expect(history.status()).not.toBe('已同步')
})
it('reports a successful explicit retry even when an unrelated draft in the same flush fails', async () => {
  const history = new ServerHistory(directory, crypto, auth)
  await history.saveDraft(record)
  await history.saveDraft({ ...record, id: 'unrelated' })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (body.record.id === 'unrelated') throw new Error('unrelated offline')
    return Response.json({ version: 1, record: body.record })
  }))
  await expect(history.retryDraft('one')).resolves.toBeUndefined()
  await expect(history.localDraft('one')).rejects.toThrow('不存在')
  expect((await history.localDraft('unrelated')).id).toBe('unrelated')
  expect(history.status()).not.toBe('已同步')
})
