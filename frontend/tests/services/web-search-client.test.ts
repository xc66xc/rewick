import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../src/shared/defaults'
import type { Settings } from '../../src/shared/types'
import { WebSearchClient } from '../../src/main/services/web-search-client'
import { SessionFault } from '../../src/main/services/session-fault'

function settings(): Settings {
  return { ...structuredClone(defaultSettings), webSearch: { enabled: true }, platform: {
    ...defaultSettings.platform, enabled: true, authenticated: true, baseUrl: 'https://platform.example',
    capabilities: { llm: true, asr: true, }, models: { llm: 'test', asr: 'test' },
    advancedSettingsEnabled: true, webSearchAvailable: true, webSearchTimeoutMs: 8000,
  } }
}
const result = { status: 'ready', excerpts: [{ source: 'web', documentId: 'web:one', chunkId: 'w1', revision: 1, kind: 'technical', name: '官网', title: '标题', url: 'https://example.com/guide', text: '网页正文', score: 0.9 }] }
afterEach(() => vi.unstubAllGlobals())

describe('platform web search', () => {
  const summary = { source: 'web', generatedSummary: true, documentId: 'web:summary', chunkId: 's1', revision: 1, kind: 'technical', name: 'Tavily 生成摘要（非网页原文）', text: '生成摘要' }
  it('accepts a generated summary without inventing a source URL, including a summary-only result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'ready', excerpts: [summary] })))
    const response = await new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)
    expect(response.excerpts).toEqual([summary])
    expect(response.web?.status).toBe('ready')
  })

  it('retains all twenty webpage slots and one distinct summary within the text budget', async () => {
    const excerpts = [...Array.from({ length: 20 }, (_, index) => ({ ...result.excerpts[0], chunkId: `web:${index}`, text: '实际网页' })), summary]
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'ready', excerpts })))
    expect((await new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)).excerpts).toEqual(excerpts)
  })

  it.each(['duplicate', 'fake-url', 'personal', 'unmarked', 'twenty-one-pages'] as const)('rejects invalid summary metadata or count (%s)', async reason => {
    const excerpts = reason === 'duplicate' ? [summary, { ...summary, chunkId: 's2' }]
      : reason === 'fake-url' ? [{ ...summary, url: 'https://example.com' }]
      : reason === 'personal' ? [{ ...summary, kind: 'personal' }]
      : reason === 'unmarked' ? [{ ...summary, generatedSummary: false }]
      : Array.from({ length: 21 }, (_, index) => ({ ...result.excerpts[0], chunkId: String(index) }))
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'ready', excerpts })))
    expect((await new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)).status).toBe('degraded')
  })
  it('sends only the current query and a unique request id, retaining safe metadata', async () => {
    const fetcher = vi.fn(async () => Response.json(result))
    vi.stubGlobal('fetch', fetcher)
    const client = new WebSearchClient(settings(), 'platform-token')
    const response = await client.retrieve('当前问题', new AbortController().signal)
    await client.retrieve('第二题', new AbortController().signal)
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('https://platform.example/api/v1/web-search')
    const body = JSON.parse(String(calls[0][1].body))
    expect(Object.keys(body).sort()).toEqual(['query', 'requestId'])
    expect(body.query).toBe('当前问题')
    expect(body.requestId).not.toBe(JSON.parse(String(calls[1][1].body)).requestId)
    expect(response.excerpts).toEqual(result.excerpts)
    expect(response.web?.status).toBe('ready')
  })

  it.each(['disabled', 'unavailable', 'unpermitted'] as const)('does not contact the provider when %s', async reason => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const config = settings()
    if (reason === 'disabled') config.webSearch = { enabled: false }
    if (config.platform && reason === 'unavailable') config.platform.webSearchAvailable = false
    if (config.platform && reason === 'unpermitted') config.platform.advancedSettingsEnabled = false
    const response = await new WebSearchClient(config, 'token').retrieve('问题', new AbortController().signal)
    expect(fetcher).not.toHaveBeenCalled()
    expect(response.status).toBe(reason === 'disabled' ? 'disabled' : 'degraded')
  })

  it.each([403, 429, 503])('continues with explicit degraded status for HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'safe' }, { status })))
    const response = await new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)
    expect(response.status).toBe('degraded')
    expect(response.message).toBeTruthy()
    expect(response.excerpts).toEqual([])
  })

  it('does not swallow authentication failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'session_expired' }, { status: 401 })))
    await expect(new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)).rejects.toBeInstanceOf(SessionFault)
  })

  it.each([402, 409])('stops generation on inactive session HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status })))
    await expect(new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)).rejects.toThrow('面试会话已结束')
  })

  it.each(['javascript:alert(1)', 'https://user:secret@example.com', 'file:///tmp/a'])('rejects unsafe result URLs: %s', async url => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...result, excerpts: [{ ...result.excerpts[0], url }] })))
    const response = await new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)
    expect(response.status).toBe('degraded')
    expect(response.excerpts).toEqual([])
  })

  it('rejects results exceeding the combined text budget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...result, excerpts: Array.from({ length: 5 }, () => ({ ...result.excerpts[0], text: '字'.repeat(2000) })) })))
    expect((await new WebSearchClient(settings(), 'token').retrieve('问题', new AbortController().signal)).status).toBe('degraded')
  })

  it('retains cancellation instead of degrading it into an answer', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => { controller.abort(new Error('已取消')); return Response.json(result) }))
    await expect(new WebSearchClient(settings(), 'token').retrieve('问题', controller.signal)).rejects.toThrow('已取消')
  })
})
