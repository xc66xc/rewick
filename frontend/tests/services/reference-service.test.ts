import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultSettings } from '../../src/shared/defaults'
import { ReferenceService } from '../../src/main/services/reference-service'
import type { Settings } from '../../src/shared/types'
const id = 'b03138d3-b219-4a4c-b91b-09979927d452'
const document = { id, name: '技术.md', kind: 'technical', enabled: true, status: 'pending', contextCount: 0, sectionCount: 0, format: 'md', headingMode: '', splitterVersion: 1, indexStatus: 'pending', indexError: '', contentHash: 'hash', revision: 1, createdAt: '2026-09-10T12:00:00', updatedAt: '2026-09-10T12:00:00', chunkCount: 0 }
const config: Settings = { ...defaultSettings, retrieval: { enabled: true }, platform: { ...defaultSettings.platform, capabilities: { llm: true, asr: true, }, models: { llm: '', asr: '' }, enabled: true, authenticated: true, baseUrl: 'https://platform.example', user: { id: '1', displayName: 'user' } }, interviewEnvironment: { id: 'env', name: 'env', resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: [id] } }
let service: ReferenceService
let directory: string
const expired = vi.fn()
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'platform-references-'))
  expired.mockReset()
  service = new ReferenceService(vi.fn(), async () => ({ settings: config, secrets: { platformAccessToken: 'business-token', llmApiKey: '', asrApiKey: '', } }), expired)
})
afterEach(async () => { service.dispose(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }) })
describe('platform reference library', () => {
  it('uploads selected file through authenticated multipart without storing a local copy', async () => {
    const path = join(directory, '技术.md'); await writeFile(path, 'Redis 使用过期时间。')
    const fetcher = vi.fn().mockResolvedValue(Response.json(document)); vi.stubGlobal('fetch', fetcher)
    expect(await service.importFiles([path])).toEqual([document])
    const [url, request] = fetcher.mock.calls[0]
    expect(url).toBe('https://platform.example/api/v1/references')
    expect(request.headers.Authorization).toBe('Bearer business-token')
    expect(request.headers['Content-Type']).toBeUndefined()
    expect(await request.body.get('file').text()).toBe('Redis 使用过期时间。')
  })
  it('rejects unsupported and oversized files before upload', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(service.importFiles([join(directory, 'private.exe')])).rejects.toThrow('仅支持')
    const path = join(directory, 'large.md'); await writeFile(path, Buffer.alloc(10 * 1024 * 1024 + 1))
    await expect(service.importFiles([path])).rejects.toThrow('10 MB')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('sends only the question and selected cloud IDs to backend search', async () => {
    const result = { status: 'ready', excerpts: [{ source: 'platform', documentId: id, revision: 1, name: '技术.md', kind: 'technical', chunkId: 'chunk', text: 'Redis 使用过期时间。' }] }
    const fetcher = vi.fn().mockResolvedValue(Response.json(result)); vi.stubGlobal('fetch', fetcher)
    expect(await service.retrieve('什么是 TTL？', 'other conversation', config, new AbortController().signal)).toEqual(result)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ query: '什么是 TTL？', referenceIds: [id] })
  })
  it('notifies the backend to cancel owned in-flight retrieval on abort', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'DELETE') return new Response(null, { status: 204 })
      return new Promise<Response>((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
    })
    vi.stubGlobal('fetch', fetcher)
    const pending = service.retrieve('Redis', '', config, controller.signal)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const id = fetcher.mock.calls[0][1].headers as Record<string, string>
    controller.abort()
    await expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(fetcher.mock.calls[1][0]).toBe(`https://platform.example/api/v1/references/search/${id['X-Request-Id']}`)
    expect(fetcher.mock.calls[1][1].method).toBe('DELETE')
  })
  it('does not widen missing or empty environment selections to all documents', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await service.retrieve('TTL', '', { ...config, interviewEnvironment: undefined }, new AbortController().signal)).toMatchObject({ status: 'empty' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('degrades ordinary backend failures but expires authentication on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(null, { status: 401 })))
    expect(await service.retrieve('TTL', '', config, new AbortController().signal)).toMatchObject({ status: 'degraded', excerpts: [] })
    await expect(service.retrieve('TTL', '', config, new AbortController().signal)).rejects.toThrow('登录已失效')
    expect(expired).toHaveBeenCalledWith('business-token')
  })
  it('rejects late responses after account disposal', async () => {
    let complete: (response: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve })))
    const pending = service.list()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    service.dispose(); complete(Response.json([document]))
    await expect(pending).rejects.toThrow('账户已切换')
  })
  it('forwards preview, update, reindex and delete with validated identifiers', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ document, text: '正文' })).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    expect((await service.preview(id)).text).toBe('正文')
    await service.update(id, { enabled: false }); await service.reindex(id); await service.remove(id)
    expect(fetcher.mock.calls.map(call => call[1].method)).toEqual(['GET', 'PATCH', 'POST', 'DELETE'])
    await expect(service.remove('../other')).rejects.toThrow()
  })
})
