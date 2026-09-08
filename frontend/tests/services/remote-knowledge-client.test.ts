import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../src/shared/types'
import { RemoteKnowledgeClient } from '../../src/main/services/remote-knowledge-client'

const config: Settings['remoteKnowledge'] = { enabled: true, url: 'https://knowledge.example/api/rag/knowledge/search', agentId: 'published-agent', hasApiKey: true }
const signal = () => new AbortController().signal
const response = (nodes: unknown[] = [], fields: Record<string, unknown> = {}) => ({ success: true, code: 'Success', status: 'SUCCESS', status_code: 200, data: { nodes }, ...fields })
function jsonFetch(value: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('RemoteKnowledgeClient', () => {
  it('does not request anything when disabled even if no endpoint or credentials are configured', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const client = new RemoteKnowledgeClient({ enabled: false, url: '', agentId: '', hasApiKey: false }, '')
    expect(await client.retrieve('当前问题', signal())).toEqual({ status: 'disabled', excerpts: [] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts only the current query and extracts text without retaining provider metadata or following links', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(response([{ text: '远程检索片段', score: 0.9, metadata: {
      doc_name: '云端资料.pdf', doc_id: 'document-id', _id: 'chunk-id', pipeline_id: 'pipeline-id',
      page_number: [5, 2, 3, 0, -1, 1.5, 100001, '1'], image_url: 'https://private.example/image', doc_url: 'https://private.example/file',
    } }]))))
    vi.stubGlobal('fetch', fetch)
    const client = new RemoteKnowledgeClient(config, 'test-only-secret')
    const result = await client.retrieve('仅这个问题？', signal())
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(config.url, expect.objectContaining({
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-only-secret' },
      body: JSON.stringify({ agent_id: config.agentId, query: '仅这个问题？', images: [] }), signal: expect.any(AbortSignal),
    }))
    expect(result).toMatchObject({ status: 'ready', remote: { agentId: config.agentId, status: 'ready' }, excerpts: [{
      source: 'bailian', name: '百炼远程知识库', kind: 'technical', revision: 1, text: '远程检索片段',
    }] })
    expect(result.excerpts[0].documentId.length).toBeLessThanOrEqual(128)
    expect(result.excerpts[0].chunkId.length).toBeLessThanOrEqual(200)
    expect(JSON.stringify(result)).not.toMatch(/test-only-secret|private\.example|score|doc_url|image_url|云端资料|document-id|chunk-id|pipeline-id|pageStart|pageEnd|metadata/)
  })

  it('accepts success without auxiliary status fields and preserves provider order', async () => {
    jsonFetch({ success: true, data: { nodes: [{ text: 'first', score: 0.1 }, { text: 'second', score: 0.99 }] } })
    const result = await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())
    expect(result.excerpts.map(excerpt => excerpt.text)).toEqual(['first', 'second'])
    expect(result.excerpts[0].name).toBe('百炼远程知识库')
  })

  it.each([
    { success: false }, { success: 'true' }, { success: undefined },
    { code: 'Failure' }, { code: 0 }, { code: 'OK' }, { status: 'ERROR' }, { status: null }, { status_code: 500 }, { status_code: '200' },
  ])('rejects a failed or incompatible success marker even when nodes are present %#', async fields => {
    jsonFetch(response([{ text: '不得使用的内容' }], { ...fields, message: 'private-provider-message' }))
    const result = await new RemoteKnowledgeClient(config, 'test-secret').retrieve('private-query', signal())
    expect(result).toMatchObject({ status: 'degraded', excerpts: [], remote: { agentId: config.agentId, status: 'degraded' } })
    expect(result.message).toBeTruthy()
    expect(JSON.stringify(result)).not.toMatch(/不得使用|private-provider-message|private-query|test-secret/)
  })

  it.each([null, [], { success: true }, { success: true, data: {} }, { success: true, data: { nodes: {} } }])('rejects incompatible top-level response shapes %#', async value => {
    jsonFetch(value)
    expect(await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())).toMatchObject({ status: 'degraded', excerpts: [] })
  })

  it('ignores non-text nodes and all metadata including valid page numbers', async () => {
    jsonFetch(response([null, 'text', { text: 42 }, { text: '  ' },
      { text: '有效内容', metadata: { page_number: [100000, Number.MAX_SAFE_INTEGER, 0] } },
      { text: '没有有效页码', metadata: { page_number: [-1, 0, '2', 2.5] } }]))
    const result = await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())
    expect(result.excerpts.map(excerpt => excerpt.text)).toEqual(['有效内容', '没有有效页码'])
    expect(result.excerpts[0]).not.toHaveProperty('pageStart')
    expect(result.excerpts[0]).not.toHaveProperty('pageEnd')
    expect(result.excerpts[1]).not.toHaveProperty('pageStart')
    expect(result.excerpts[1]).not.toHaveProperty('pageEnd')
  })

  it('clips individual text at 2000 characters and the combined text at 6000 characters', async () => {
    jsonFetch(response([{ text: 'a'.repeat(2500) }, { text: 'b'.repeat(1700) }, { text: 'c'.repeat(1800) }, { text: 'd'.repeat(800) }, { text: 'ignored' }]))
    const result = await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())
    expect(result.excerpts.map(excerpt => excerpt.text.length)).toEqual([2000, 1700, 1800, 500])
    expect(result.excerpts.at(-1)?.text).toBe('d'.repeat(500))
    expect(result.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0)).toBe(6000)
  })

  it('takes at most six nonempty nodes with bounded bookkeeping independent of provider metadata', async () => {
    jsonFetch(response(Array.from({ length: 8 }, (_, index) => ({ text: `内容 ${index}`, metadata: {
      doc_name: '名'.repeat(300), doc_id: 'doc'.repeat(1000), _id: `node-${index}${'x'.repeat(1000)}`, pipeline_id: 'pipeline'.repeat(1000),
    } }))))
    const client = new RemoteKnowledgeClient(config, 'test-key')
    const first = await client.retrieve('问题', signal())
    jsonFetch(response(Array.from({ length: 8 }, (_, index) => ({ text: `内容 ${index}` }))))
    const second = await client.retrieve('问题', signal())
    expect(first.excerpts).toHaveLength(6)
    expect(first.excerpts).toEqual(second.excerpts)
    expect(first.excerpts.map(excerpt => excerpt.text)).toEqual(Array.from({ length: 6 }, (_, index) => `内容 ${index}`))
    expect(new Set(first.excerpts.map(excerpt => excerpt.chunkId)).size).toBe(6)
    expect(first.excerpts.every(excerpt => excerpt.name === '百炼远程知识库' && excerpt.documentId.length <= 128 && excerpt.chunkId.length <= 200)).toBe(true)
  })

  it('reports empty retrieval and treats a fixed-query connection test with no matches as successful', async () => {
    const fetch = jsonFetch(response())
    const client = new RemoteKnowledgeClient({ ...config, enabled: false }, 'test-key')
    expect(await client.test()).toMatchObject({ latencyMs: expect.any(Number), message: expect.stringContaining('连接成功') })
    expect(fetch).toHaveBeenCalledWith(config.url, expect.objectContaining({ body: JSON.stringify({ agent_id: config.agentId, query: '远程知识库连接测试', images: [] }) }))
    const empty = await new RemoteKnowledgeClient(config, 'test-key').retrieve('当前问题', signal())
    expect(empty).toMatchObject({ status: 'empty', excerpts: [], message: expect.stringContaining('未找到'), remote: { status: 'empty', agentId: config.agentId } })
  })

  it('uses a constructor configuration snapshot when later settings are edited', async () => {
    const fetch = jsonFetch(response())
    const mutable = { ...config }
    const client = new RemoteKnowledgeClient(mutable, 'test-key')
    mutable.url = 'https://changed.example/secret'
    mutable.agentId = 'changed-agent'
    mutable.enabled = false
    expect((await client.retrieve('问题', signal())).remote?.agentId).toBe(config.agentId)
    expect(fetch).toHaveBeenCalledWith(config.url, expect.objectContaining({ body: JSON.stringify({ agent_id: config.agentId, query: '问题', images: [] }) }))
  })

  it.each(['http://remote.example/search', 'https://user:password@example.com/search', 'file:///private/file', 'https://example.com/search#fragment', ''])('rejects unsafe or empty endpoint %s before requesting', async url => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await new RemoteKnowledgeClient({ ...config, url }, 'test-key').retrieve('问题', signal())
    expect(result.status).toBe('degraded')
    expect(result.message).toContain('HTTPS')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('supports a loopback HTTP mock URL without changing the supplied route', async () => {
    const fetch = jsonFetch(response())
    const url = 'http://127.0.0.1:54321/custom/search?test=1'
    await new RemoteKnowledgeClient({ ...config, url }, 'test-key').retrieve('问题', signal())
    expect(fetch).toHaveBeenCalledWith(url, expect.any(Object))
  })

  it.each(['', 'test\nkey', 'x'.repeat(4097)])('rejects an invalid dedicated API key without echoing it %#', async apiKey => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await new RemoteKnowledgeClient(config, apiKey).retrieve('问题', signal())
    expect(result).toMatchObject({ status: 'degraded', message: expect.stringContaining('API Key') })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([' ', 'x'.repeat(20001)])('rejects an empty or oversized query without sending it %#', async query => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await new RemoteKnowledgeClient(config, 'test-key').retrieve(query, signal())).status).toBe('degraded')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not expose HTTP error bodies and rejects an unsuccessful connection test', async () => {
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 401 })))
    const client = new RemoteKnowledgeClient(config, 'private-key')
    const result = await client.retrieve('private-question', signal())
    expect(result).toMatchObject({ status: 'degraded', message: expect.stringContaining('HTTP 401') })
    expect(JSON.stringify(result)).not.toMatch(/private-key|private-question/)
    expect(cancel).toHaveBeenCalledTimes(1)
    await expect(client.test()).rejects.toThrow('HTTP 401')
  })

  it.each(['<html>private-provider-response</html>', '{"secret":"private-key"'])('hides invalid JSON response text %#', async raw => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(raw)))
    const result = await new RemoteKnowledgeClient(config, 'private-key').retrieve('private-question', signal())
    expect(result).toMatchObject({ status: 'degraded', message: expect.stringContaining('JSON') })
    expect(JSON.stringify(result)).not.toMatch(/private-provider-response|private-key|private-question/)
  })

  it('hides transport and body read errors', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('private-url-and-key'))
      .mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.error(new Error('private-response-body')) } })))
    vi.stubGlobal('fetch', fetch)
    const client = new RemoteKnowledgeClient(config, 'test-key')
    for (let index = 0; index < 2; index++) {
      const result = await client.retrieve('问题', signal())
      expect(result).toMatchObject({ status: 'degraded', message: expect.stringContaining('连接失败') })
      expect(JSON.stringify(result)).not.toContain('private-')
    }
  })

  it('rejects oversized Content-Length before reading the body and cancels the stream', async () => {
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { 'Content-Length': String(2 * 1_048_576 + 1) } })))
    const result = await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())
    expect(result).toMatchObject({ status: 'degraded', message: expect.stringContaining('2 MiB') })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('enforces the byte limit while streaming even when Content-Length is missing', async () => {
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1_048_576)); controller.enqueue(new Uint8Array(1)) }, cancel,
    }))))
    const result = await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())
    expect(result).toMatchObject({ status: 'degraded', message: expect.stringContaining('2 MiB') })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('accepts a valid response exactly at the byte limit and decodes fragmented UTF-8 correctly', async () => {
    const raw = Buffer.from(JSON.stringify(response([{ text: '中文片段' }])))
    const padding = Buffer.alloc(2 * 1_048_576 - raw.byteLength, 32)
    const split = raw.indexOf(Buffer.from('中')) + 1
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(raw.subarray(0, split)); controller.enqueue(raw.subarray(split)); controller.enqueue(padding); controller.close() },
    }))))
    expect((await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())).excerpts[0].text).toBe('中文片段')
  })

  it('times out the complete operation before response headers and cleans up a late response', async () => {
    vi.useFakeTimers()
    let resolveResponse: (response: Response) => void = () => undefined
    const fetch = vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve }))
    vi.stubGlobal('fetch', fetch)
    const pending = new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())
    await vi.advanceTimersByTimeAsync(5001)
    expect(await pending).toMatchObject({ status: 'degraded', message: expect.stringContaining('超时') })
    const cancel = vi.fn()
    resolveResponse(new Response(new ReadableStream({ cancel })))
    await Promise.resolve()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses one timeout budget for fetching headers and reading a stalled response body', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 3000))
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"success":')) }, cancel }))
    }))
    const pending = new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', signal())
    await vi.advanceTimersByTimeAsync(5001)
    expect(await pending).toMatchObject({ status: 'degraded', message: expect.stringContaining('超时') })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propagates an already-aborted caller signal without fetching or returning degraded content', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    const reason = new DOMException('User cancelled', 'AbortError')
    controller.abort(reason)
    await expect(new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', controller.signal)).rejects.toBe(reason)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards caller cancellation to the pending HTTP request and releases its timeout', async () => {
    vi.useFakeTimers()
    let transportSignal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      transportSignal = options.signal
      return new Promise<Response>(() => undefined)
    }))
    const controller = new AbortController()
    const reason = new DOMException('Cancel old question', 'AbortError')
    const pending = new RemoteKnowledgeClient(config, 'test-key').retrieve('旧问题', controller.signal)
    const rejected = expect(pending).rejects.toBe(reason)
    controller.abort(reason)
    await rejected
    expect(transportSignal?.aborted).toBe(true)
    expect(transportSignal?.reason).toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propagates cancellation during an asynchronous body read and does not wait for stream cleanup', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    let bodyStarted: () => void = () => undefined
    const started = new Promise<void>(resolve => { bodyStarted = resolve })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ pull() { bodyStarted() }, cancel }))))
    const controller = new AbortController()
    const reason = new DOMException('Cancelled during read', 'AbortError')
    const pending = new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', controller.signal)
    const rejected = expect(pending).rejects.toBe(reason)
    await started
    await Promise.resolve()
    controller.abort(reason)
    await rejected
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears its timeout and caller listener after a successful response', async () => {
    vi.useFakeTimers()
    jsonFetch(response([{ text: '完成' }]))
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const result = await new RemoteKnowledgeClient(config, 'test-key').retrieve('问题', controller.signal)
    expect(result.status).toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
    const listener = add.mock.calls.find(([type]) => type === 'abort')?.[1]
    expect(remove).toHaveBeenCalledWith('abort', listener)
    controller.abort()
    expect(result.status).toBe('ready')
  })
})
