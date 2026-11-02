import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { create } from 'tar'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RecordingResourceManager, type RecordingResourceManagerOptions, type RecordingResourceSpec } from '../../src/main/services/recording-resource-manager'

let root: string
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'rewick-resource-test-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }); vi.restoreAllMocks() })
async function fixture(kind: 'runtime' | 'model', unsafe = false) {
  const source = join(root, `source-${kind}`)
  const filename = kind === 'runtime' ? 'bin/python3' : 'model.bin'
  await mkdir(dirname(join(source, filename)), { recursive: true })
  const payload = Buffer.from(`${kind}-synthetic-fixture`)
  await writeFile(join(source, filename), payload)
  if (unsafe) await symlink('../../outside', join(source, 'escape'))
  const archive = join(root, `${kind}.tar.gz`)
  await create({ file: archive, cwd: source, gzip: true, portable: true }, ['.'])
  const body = await readFile(archive)
  const spec: RecordingResourceSpec = { resourceId: kind, kind, url: `https://github.com/xc66xc/rewick/releases/download/desktop-v2.1.0/${kind}.tar.gz`, sha256: hash(body), archiveBytes: body.length, unpackedBytes: 10000, maxEntries: 20, criticalFiles: [{ path: filename, sha256: hash(payload), size: payload.length }] }
  return { spec, body }
}
async function setup(extra: Partial<RecordingResourceManagerOptions> = {}) {
  const runtime = await fixture('runtime')
  const model = await fixture('model')
  const fetcher = vi.fn(async (url: string | URL | Request) => new Response(String(url).includes('/runtime.') ? runtime.body : model.body, { headers: { etag: '"fixture"' } })) as unknown as typeof fetch & ReturnType<typeof vi.fn>
  const check = vi.fn(async () => undefined)
  const options = { root: join(root, 'cache'), runtime: runtime.spec, model: model.spec, platform: 'darwin' as const, fetch: fetcher, freeBytes: async () => 1024 ** 3, check, ...extra }
  return { manager: new RecordingResourceManager(options), runtime, model, fetcher, check, options }
}
it('downloads once, validates, activates atomically and reuses the ready cache after restart', async () => {
  const { manager, fetcher, check, options } = await setup()
  const updates: string[] = []
  expect((await manager.status()).ready).toBe(false)
  const paths = await manager.ensure(new AbortController().signal, value => updates.push(value.stage))
  expect(paths.pythonPath).toContain('/runtime/')
  expect(paths.modelPath).toContain('/model/')
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(check).toHaveBeenCalledTimes(1)
  expect(updates).toEqual(expect.arrayContaining(['downloading', 'verifying', 'extracting', 'checking']))
  const restarted = new RecordingResourceManager(options)
  expect(await restarted.status()).toEqual({ ready: true, downloadBytes: 0, requiredBytes: 0 })
  await restarted.ensure(new AbortController().signal, () => undefined)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(check).toHaveBeenCalledTimes(1)
  expect(await readdir(join(root, 'cache', '.downloads'))).toEqual([])
})
it('rejects low disk space before contacting the download server', async () => {
  const { manager, fetcher } = await setup({ freeBytes: async () => 0 })
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('磁盘空间不足')
  expect(fetcher).not.toHaveBeenCalled()
})
it('rejects an archive hash mismatch without marking any resource ready', async () => {
  const { options } = await setup()
  const original = options.fetch
  options.fetch = vi.fn(async (_url, init) => { const response = await original(_url, init); const bytes = Buffer.from(await response.arrayBuffer()); bytes[bytes.length - 1] ^= 1; return new Response(bytes) })
  const manager = new RecordingResourceManager(options)
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('校验失败')
  expect((await manager.status()).ready).toBe(false)
  await expect(readdir(join(root, 'cache', '.staging'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('rejects symlink escapes before extracting payloads', async () => {
  if (process.platform === 'win32') return // Windows CI does not grant symlink creation privileges.
  const { options, model } = await setup()
  const unsafe = await fixture('runtime', true)
  options.runtime = unsafe.spec
  options.fetch = vi.fn(async url => new Response(String(url).includes('/runtime.') ? unsafe.body : model.body))
  const manager = new RecordingResourceManager(options)
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('越界')
  expect((await manager.status()).ready).toBe(false)
})
it('coalesces duplicate starts and rejects a second independent owner', async () => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const { options } = await setup()
  const fetcher = options.fetch
  options.fetch = vi.fn(async (url, init) => { await gate; return fetcher(url, init) })
  const manager = new RecordingResourceManager(options)
  const signal = new AbortController().signal
  const first = manager.ensure(signal, () => undefined)
  expect(manager.ensure(signal, () => undefined)).toBe(first)
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('正在准备')
  finish(); await first
  expect(options.fetch).toHaveBeenCalledTimes(2)
})
it('cancels the active download and lets a later attempt succeed without exposing partial resources', async () => {
  const { options } = await setup()
  const controller = new AbortController()
  const original = options.fetch
  options.fetch = vi.fn(async (_url, init) => {
    controller.abort()
    init?.signal?.throwIfAborted()
    return new Response()
  })
  const manager = new RecordingResourceManager(options)
  await expect(manager.ensure(controller.signal, () => undefined)).rejects.toThrow('已取消')
  expect((await manager.status()).ready).toBe(false)
  options.fetch = original
  await manager.ensure(new AbortController().signal, () => undefined)
  expect((await manager.status()).ready).toBe(true)
})
it('repairs a missing critical file and cleans abandoned staging without disturbing ready model data', async () => {
  const { manager, options, fetcher } = await setup()
  const paths = await manager.ensure(new AbortController().signal, () => undefined)
  await rm(paths.pythonPath)
  const stale = join(root, 'cache', '.staging', 'old')
  await mkdir(stale, { recursive: true }); await writeFile(join(stale, 'partial'), 'stale')
  expect((await manager.status()).ready).toBe(false)
  await new RecordingResourceManager(options).ensure(new AbortController().signal, () => undefined)
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect((await manager.status()).ready).toBe(true)
})
it('does not activate a downloaded environment when the offline model load check fails', async () => {
  const { manager } = await setup({ check: async () => { throw new Error('本地语音环境检查失败。') } })
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('检查失败')
  expect((await manager.status()).ready).toBe(false)
})
it('rejects untrusted source and redirect URLs without sending credentials', async () => {
  const { options } = await setup()
  options.fetch = vi.fn(async (_url, init) => {
    expect(init?.credentials).toBe('omit')
    expect(init?.headers).not.toHaveProperty('Authorization')
    return new Response(null, { status: 302, headers: { location: 'https://untrusted.example/runtime.tar.gz' } })
  })
  const manager = new RecordingResourceManager(options)
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('不受信任')
  expect(options.fetch).toHaveBeenCalledTimes(1)
})
it('resumes only a strong ETag and exact 206 range, then verifies the complete archive', async () => {
  const { options, runtime, model } = await setup()
  const downloads = join(root, 'cache', '.downloads')
  await mkdir(downloads, { recursive: true })
  const offset = Math.floor(runtime.body.length / 2)
  await writeFile(join(downloads, `${runtime.spec.sha256}.tar.gz`), runtime.body.subarray(0, offset))
  await writeFile(join(downloads, `${runtime.spec.sha256}.tar.gz.etag`), JSON.stringify({ sha256: runtime.spec.sha256, etag: '"same"' }))
  options.fetch = vi.fn(async (url, init) => {
    if (String(url).includes('/runtime.')) {
      expect(init?.headers).toMatchObject({ Range: `bytes=${offset}-`, 'If-Range': '"same"' })
      return new Response(runtime.body.subarray(offset), { status: 206, headers: { etag: '"same"', 'content-range': `bytes ${offset}-${runtime.body.length - 1}/${runtime.body.length}` } })
    }
    return new Response(model.body)
  })
  const manager = new RecordingResourceManager(options)
  await manager.ensure(new AbortController().signal, () => undefined)
  expect((await manager.status()).ready).toBe(true)
})
it('restarts rather than appending a response with a changed ETag', async () => {
  const { options, runtime, model } = await setup()
  const downloads = join(root, 'cache', '.downloads')
  await mkdir(downloads, { recursive: true })
  const offset = Math.floor(runtime.body.length / 2)
  await writeFile(join(downloads, `${runtime.spec.sha256}.tar.gz`), runtime.body.subarray(0, offset))
  await writeFile(join(downloads, `${runtime.spec.sha256}.tar.gz.etag`), JSON.stringify({ sha256: runtime.spec.sha256, etag: '"old"' }))
  let calls = 0
  options.fetch = vi.fn(async (url, init) => {
    if (!String(url).includes('/runtime.')) return new Response(model.body)
    if (++calls === 1) return new Response(runtime.body.subarray(offset), { status: 206, headers: { etag: '"new"', 'content-range': `bytes ${offset}-${runtime.body.length - 1}/${runtime.body.length}` } })
    expect(init?.headers).not.toHaveProperty('Range')
    return new Response(runtime.body)
  })
  const manager = new RecordingResourceManager(options)
  await manager.ensure(new AbortController().signal, () => undefined)
  expect(calls).toBe(2)
  expect((await manager.status()).ready).toBe(true)
})
it('limits unpacked data even when the archive SHA256 is correct', async () => {
  const { options } = await setup()
  options.runtime = { ...options.runtime, unpackedBytes: 1 }
  const manager = new RecordingResourceManager(options)
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('解压大小超过限制')
  expect((await manager.status()).ready).toBe(false)
})
it('stops a stalled request at the bounded task deadline and releases the owner', async () => {
  const { options } = await setup({ taskTimeoutMs: 25, connectionTimeoutMs: 100, idleTimeoutMs: 100 })
  options.fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  }))
  const manager = new RecordingResourceManager(options)
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('准备超时')
  expect((await manager.status()).ready).toBe(false)
})
it('invalidates only ready markers, retaining public files and other cached versions', async () => {
  const { manager, options } = await setup()
  const paths = await manager.ensure(new AbortController().signal, () => undefined)
  const old = join(options.root, 'runtime', 'old-version')
  await mkdir(old, { recursive: true }); await writeFile(join(old, 'keep'), 'keep')
  await manager.invalidate()
  expect((await manager.status()).ready).toBe(false)
  expect((await readFile(paths.pythonPath)).length).toBeGreaterThan(0)
  expect(await readFile(join(old, 'keep'), 'utf8')).toBe('keep')
})
it.each(['metadata', 'archive'] as const)('aborts and cancels the unconsumed response when the %s path is unwritable', async failure => {
  const { manager, options, runtime } = await setup()
  const archive = join(options.root, '.downloads', `${runtime.spec.sha256}.tar.gz`)
  await mkdir(failure === 'metadata' ? `${archive}.etag` : archive, { recursive: true })
  const cancel = vi.fn()
  const signals: AbortSignal[] = []
  const fetcher = vi.fn(async (_url, init) => {
    if (init?.signal) signals.push(init.signal)
    return new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { etag: '"fixture"' } })
  })
  options.fetch = fetcher
  await expect(manager.ensure(new AbortController().signal, () => undefined)).rejects.toThrow('语音资源无法写入')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(signals).toHaveLength(1)
  expect(signals[0].aborted).toBe(true)
  expect((await manager.status()).ready).toBe(false)
})
