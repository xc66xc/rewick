import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { mkdtemp, mkdir, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReferenceService } from '../../src/main/services/reference-service'
import { defaultSettings } from '../../src/shared/defaults'
import type { Settings } from '../../src/shared/types'

let directory: string
let server: Server
let service: ReferenceService
let configuration: Settings['embedding']
let mode: 'normal' | 'hold' | 'wrong-dimension' | 'error'
let requests: { input: string[]; dimensions: number; model: string }[]
let held: ServerResponse[]
function vector(text: string, dimensions: number): number[] {
  const result = Array(dimensions).fill(0) as number[]
  result[/Redis|缓存|内存键值/i.test(text) ? 0 : /MySQL|数据库|事务/i.test(text) ? 1 : 2] = 1
  return result
}
function settings(): Settings { return { ...defaultSettings, embedding: { ...configuration }, retrieval: { enabled: true } } }
async function importText(name: string, text: string) {
  const path = join(directory, name)
  await writeFile(path, text)
  const [document] = await service.importFiles([path])
  if (!document) throw new Error('Document missing')
  return document
}
async function ready(id: string, revision = 1) {
  await vi.waitFor(async () => {
    expect((await service.list()).find((document) => document.id === id)).toMatchObject({ status: 'ready', revision })
  }, { timeout: 5000 })
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'copilot-reference-'))
  requests = []; held = []; mode = 'normal'
  server = createServer(async (request, response) => {
    const blocks = []
    for await (const block of request) blocks.push(block)
    const payload = JSON.parse(Buffer.concat(blocks).toString()) as typeof requests[number]
    requests.push(payload)
    if (mode === 'hold') { held.push(response); return }
    response.setHeader('Content-Type', 'application/json')
    if (mode === 'error') { response.statusCode = 503; response.end('PRIVATE_PROVIDER_DETAIL'); return }
    response.end(JSON.stringify({ data: payload.input.map((text, index) => ({ index,
      embedding: vector(text, mode === 'wrong-dimension' ? 2 : payload.dimensions) })) }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No address')
  configuration = { ...defaultSettings.embedding, baseUrl: `http://127.0.0.1:${address.port}/v1`, dimensions: 64 }
  service = new ReferenceService(join(directory, 'private'), () => undefined, async () => ({ config: { ...configuration }, apiKey: '' }))
  await service.refreshConfiguration()
})
afterEach(async () => {
  service.dispose()
  for (const response of held) response.destroy()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(directory, { recursive: true, force: true })
})

describe('ReferenceService', () => {
  it('uses the selected platform vector config for indexing and retrieval instead of stale custom settings', async () => {
    const baseUrl = configuration.baseUrl.replace(/\/v1$/, '')
    configuration = { ...configuration, baseUrl: `${baseUrl}/api/v1`, serviceId: 'platform-vector', fingerprint: 'model-v1' }
    await service.refreshConfiguration()
    const document = await importText('platform.md', 'Redis 缓存使用 TTL 过期时间。')
    await ready(document.id)
    const config = settings()
    config.embedding = { ...defaultSettings.embedding }
    config.platform = { baseUrl, enabled: true, authenticated: true, capabilities: { llm: false, asr: false, knowledge: false }, models: { llm: '', asr: '' },
      services: { asr: [], knowledge: [], embedding: [{ id: 'platform-vector', name: '中文向量', model: configuration.model, dimensions: 64, fingerprint: 'model-v1' }] } }
    config.serviceSelections = { embedding: { source: 'platform', id: 'platform-vector' } }
    const count = requests.length
    const result = await service.retrieve('内存键值服务如何避免陈旧值', '', config, new AbortController().signal)
    expect(result).toMatchObject({ status: 'ready', excerpts: [{ documentId: document.id }] })
    expect(requests.length).toBe(count + 1)
    expect(requests.at(-1)).toMatchObject({ serviceId: 'platform-vector', dimensions: 64 })
    mode = 'error'
    expect(await service.retrieve('Redis TTL 过期怎么实现？', '', config, new AbortController().signal)).toMatchObject({ status: 'degraded', excerpts: [{ documentId: document.id }] })
  })
  it('ranks only the documents selected by this interview environment, including keyword fallback', async () => {
    const selected = await importText('selected.md', 'Redis 缓存一致性：先写数据库后删除缓存。SELECTED_ONLY')
    const excluded = await importText('excluded.md', 'Redis 缓存一致性：缓存击穿、雪崩与分布式锁。EXCLUDED_ONLY')
    await ready(selected.id); await ready(excluded.id)
    const config: Settings = { ...settings(), interviewEnvironment: { id: 'environment', name: '环境一', resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: [selected.id] } }
    const result = await service.retrieve('Redis 缓存一致性如何实现？', '', config, new AbortController().signal)
    expect(result.excerpts.map(value => value.documentId)).toEqual([selected.id])
    mode = 'error'
    const fallback = await service.retrieve('Redis 缓存更新怎么处理？', '', config, new AbortController().signal)
    expect(fallback.status).toBe('degraded')
    expect(fallback.excerpts.map(value => value.documentId)).toEqual([selected.id])
    expect(JSON.stringify(fallback)).not.toContain('EXCLUDED_ONLY')
  })

  it('does not call embeddings or fall back to all documents for an empty or removed selection', async () => {
    const document = await importText('available.md', 'Redis 缓存一致性：使用 TTL 和缓存主动失效。')
    await ready(document.id)
    const config: Settings = { ...settings(), interviewEnvironment: { id: 'environment', name: '无资料环境', resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: [] } }
    const count = requests.length
    expect(await service.retrieve('Redis 缓存一致性？', '', config, new AbortController().signal)).toMatchObject({ status: 'empty', excerpts: [] })
    config.interviewEnvironment = { ...config.interviewEnvironment, id: 'environment', name: '失效资料环境', resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: ['removed-document'] }
    expect(await service.retrieve('Redis 缓存一致性？', '', config, new AbortController().signal)).toMatchObject({ status: 'empty', excerpts: [] })
    expect(requests).toHaveLength(count)
  })

  it('keeps a private source copy, deduplicates content and retrieves the correct personal version', async () => {
    const document = await importText('redis.md', '# Redis\n\n缓存一致性采用先更新数据库再删除缓存。')
    await ready(document.id)
    const [duplicate] = await service.importFiles([join(directory, 'redis.md')])
    expect(duplicate.id).toBe(document.id)
    expect(await service.list()).toHaveLength(1)
    await unlink(join(directory, 'redis.md'))
    expect((await service.preview(document.id)).text).toContain('缓存一致性')
    await service.update(document.id, { kind: 'personal' })
    const result = await service.retrieve('Redis 缓存一致性怎么做', '', settings(), new AbortController().signal)
    expect(result).toMatchObject({ status: 'ready', excerpts: [{ documentId: document.id, revision: 1, kind: 'personal' }] })
    expect((await stat(join(directory, 'private', 'references.sqlite'))).mode & 0o777).toBe(0o600)
    const [copy] = await readdir(join(directory, 'private', 'documents'))
    expect((await stat(join(directory, 'private', 'documents', copy))).mode & 0o777).toBe(0o600)
  })

  it('recalls semantic paraphrases, rejects unrelated topics, and ignores old transcript for a new question', async () => {
    const cache = await importText('cache.md', 'Redis 使用过期时间和主动失效保证缓存一致性。')
    const database = await importText('database.md', 'MySQL 数据库使用 MVCC 实现事务隔离。')
    await ready(cache.id); await ready(database.id)
    const started = performance.now()
    const semantic = await service.retrieve('内存键值服务如何避免陈旧值', '', settings(), new AbortController().signal)
    const semanticMs = performance.now() - started
    expect(semantic.excerpts.map((excerpt) => excerpt.documentId)).toEqual([cache.id])
    const unrelated = await service.retrieve('如何烘焙蛋糕', '', settings(), new AbortController().signal)
    expect(unrelated).toMatchObject({ status: 'empty', excerpts: [] })
    const current = await service.retrieve('MySQL 事务隔离', 'Redis 缓存一致性\nRedis TTL\n缓存击穿', settings(), new AbortController().signal)
    expect(current.excerpts.map((excerpt) => excerpt.documentId)).toEqual([database.id])
    expect(requests.at(-1)?.input[0]).not.toContain('Redis')
    if (process.env.COPILOT_RETRIEVAL_BENCHMARK === '1') console.info(JSON.stringify({ fixtureChecks: 3, fixtureChecksPassed: 3, mockSemanticMs: Math.round(semanticMs * 10) / 10 }))
  })

  it('falls back to keywords after the one-second query budget and cancels stale retrieval', async () => {
    const document = await importText('redis.md', 'Redis 缓存使用 TTL 过期时间。')
    await ready(document.id)
    mode = 'hold'
    const started = performance.now()
    const result = await service.retrieve('Redis TTL 怎么设置', '', settings(), new AbortController().signal)
    const elapsed = performance.now() - started
    expect(result).toMatchObject({ status: 'degraded', excerpts: [{ documentId: document.id }] })
    expect(elapsed).toBeGreaterThanOrEqual(900)
    expect(elapsed).toBeLessThan(2500)
    if (process.env.COPILOT_RETRIEVAL_BENCHMARK === '1') console.info(JSON.stringify({ mockTimeoutFallbackMs: Math.round(elapsed * 10) / 10 }))
    const controller = new AbortController()
    const count = requests.length
    const pending = expect(service.retrieve('Redis 过期机制', '', settings(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(requests.length).toBe(count + 1))
    controller.abort()
    await pending
  })

  it('rebuilds a disabled document when it is enabled after the embedding space changes', async () => {
    const document = await importText('redis.md', 'Redis 缓存使用 TTL 过期时间。')
    await ready(document.id)
    await service.update(document.id, { enabled: false })
    configuration = { ...configuration, model: 'other-space', dimensions: 128 }
    await service.refreshConfiguration()
    expect((await service.list())[0]).toMatchObject({ enabled: false, revision: 1 })
    await service.update(document.id, { enabled: true })
    await ready(document.id, 2)
    expect(requests.at(-1)).toMatchObject({ dimensions: 128, model: 'other-space' })
    expect((await service.retrieve('Redis', '', settings(), new AbortController().signal)).excerpts[0]?.revision).toBe(2)
  })

  it('keeps versions atomic on indexing failure and retries using at most ten texts per call', async () => {
    const document = await importText('large.md', 'Redis 缓存一致性。'.repeat(1100))
    await ready(document.id)
    expect(requests.length).toBeGreaterThan(1)
    expect(requests.every((request) => request.input.length <= 10)).toBe(true)
    expect(requests.some((request) => request.input.length === 10)).toBe(true)
    mode = 'wrong-dimension'
    await service.reindex(document.id)
    await vi.waitFor(async () => expect((await service.list())[0]).toMatchObject({ status: 'error', revision: 1 }))
    expect((await service.retrieve('Redis', '', settings(), new AbortController().signal)).excerpts).toEqual([])
    mode = 'normal'
    await service.reindex(document.id)
    await ready(document.id, 2)
  })

  it('preserves the request snapshot and uses keyword fallback when configuration changes before retrieval', async () => {
    const document = await importText('redis.md', 'Redis 缓存使用 TTL。')
    await ready(document.id)
    const oldSettings = settings()
    configuration = { ...configuration, model: 'new-space' }
    const count = requests.length
    const result = await service.retrieve('Redis', '', oldSettings, new AbortController().signal)
    expect(result).toMatchObject({ status: 'degraded', excerpts: [{ documentId: document.id, revision: 1 }] })
    expect(requests).toHaveLength(count)
  })

  it('recovers interrupted indexing on restart and can remove an in-flight job', async () => {
    mode = 'hold'
    const document = await importText('redis.md', 'Redis 缓存使用 TTL。')
    await vi.waitFor(async () => expect((await service.list())[0]).toMatchObject({ status: 'indexing' }))
    service.dispose()
    mode = 'normal'
    service = new ReferenceService(join(directory, 'private'), () => undefined, async () => ({ config: { ...configuration }, apiKey: '' }))
    await ready(document.id)
    mode = 'hold'
    await service.reindex(document.id)
    await vi.waitFor(async () => expect((await service.list())[0]).toMatchObject({ status: 'indexing' }))
    await service.remove(document.id)
    expect(await service.list()).toEqual([])
    expect((await stat(join(directory, 'redis.md'))).isFile()).toBe(true)
  })

  it('retains a failed-to-delete record so the user can retry removing its private copy', async () => {
    const document = await importText('redis.md', 'Redis 缓存使用 TTL。')
    await ready(document.id)
    const folder = join(directory, 'private', 'documents')
    const [name] = await readdir(folder)
    const copy = join(folder, name)
    await unlink(copy)
    await mkdir(copy)
    await expect(service.remove(document.id)).rejects.toThrow('无法删除')
    expect((await service.list())[0]).toMatchObject({ id: document.id, status: 'error' })
    await rm(copy, { recursive: true })
    await service.remove(document.id)
    expect(await service.list()).toEqual([])
  })

  it('leaves documents pending without credentials and resumes after configuration without busy looping', async () => {
    configuration = { ...configuration, baseUrl: 'https://example.invalid/v1' }
    await service.refreshConfiguration()
    const document = await importText('redis.md', 'Redis 缓存使用 TTL。')
    expect((await service.list())[0]).toMatchObject({ status: 'pending' })
    await service.refreshConfiguration()
    expect(requests).toHaveLength(0)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No address')
    configuration = { ...configuration, baseUrl: `http://127.0.0.1:${address.port}/v1` }
    await service.refreshConfiguration()
    await ready(document.id)
  })

  it('degrades gracefully when the document database is unreadable', async () => {
    service.dispose()
    const corrupted = join(directory, 'corrupt')
    await mkdir(corrupted)
    await writeFile(join(corrupted, 'references.sqlite'), 'not a SQLite database')
    service = new ReferenceService(corrupted, () => undefined, async () => ({ config: { ...configuration }, apiKey: '' }))
    await expect(service.retrieve('Redis', '', settings(), new AbortController().signal)).resolves.toMatchObject({
      status: 'degraded', excerpts: [], message: expect.stringContaining('资料读取失败'),
    })
  })
})
