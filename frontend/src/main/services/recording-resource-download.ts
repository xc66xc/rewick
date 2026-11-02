import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { RecordingResourceSpec } from './recording-resource-archive'
import { resourceHash } from './recording-resource-archive'

export interface ResourceDownloadOptions {
  fetch: typeof globalThis.fetch
  signal: AbortSignal
  connectionTimeoutMs: number
  idleTimeoutMs: number
  onProgress(downloaded: number): void
}
class DownloadError extends Error { constructor(message: string, readonly retryable = false) { super(message) } }
function allowed(url: string, initial = false): URL {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port && parsed.port !== '443'
    || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'].includes(parsed.hostname)
    || initial && (parsed.hostname !== 'github.com' || !parsed.pathname.startsWith('/xc66xc/rewick/releases/download/desktop-v'))) throw new DownloadError('语音资源下载地址不受信任。')
  return parsed
}
async function request(url: string, headers: Record<string, string>, controller: AbortController, options: ResourceDownloadOptions): Promise<Response> {
  allowed(url, true)
  let current = url
  for (let redirects = 0; redirects < 6; redirects++) {
    options.signal.throwIfAborted()
    const timer = setTimeout(() => controller.abort(new Error('语音资源连接超时。')), options.connectionTimeoutMs)
    let response: Response
    try { response = await options.fetch(current, { headers, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal }) }
    finally { clearTimeout(timer) }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const next = response.headers.get('location')
    await response.body?.cancel()
    if (!next) throw new DownloadError('语音资源下载跳转无效。')
    current = allowed(new URL(next, current).href).href
  }
  throw new DownloadError('语音资源下载跳转次数过多。')
}
async function attempt(spec: RecordingResourceSpec, path: string, options: ResourceDownloadOptions): Promise<void> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal.reason)
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) abort()
  const metadata = `${path}.etag`
  let offset = 0
  let etag = ''
  try {
    const saved = JSON.parse(await readFile(metadata, 'utf8')) as { sha256?: string; etag?: string }
    const info = await stat(path)
    if (saved.sha256 === spec.sha256 && saved.etag?.startsWith('"') && saved.etag.endsWith('"') && info.size > 0 && info.size < spec.archiveBytes) { offset = info.size; etag = saved.etag }
  } catch { /* Incomplete metadata cannot authorize a resumed request. */ }
  let response: Response | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let complete = false
  let idle: ReturnType<typeof setTimeout> | undefined
  try {
    const headers: Record<string, string> = { 'Accept-Encoding': 'identity' }
    if (offset) { headers.Range = `bytes=${offset}-`; headers['If-Range'] = etag }
    response = await request(spec.url, headers, controller, options)
    if (offset && response.status === 206) {
      const range = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
      if (response.headers.get('etag') !== etag || !range || Number(range[1]) !== offset || Number(range[2]) !== spec.archiveBytes - 1 || Number(range[3]) !== spec.archiveBytes) {
        await response.body?.cancel(); await rm(path, { force: true }); await rm(metadata, { force: true })
        offset = 0
        response = await request(spec.url, { 'Accept-Encoding': 'identity' }, controller, options)
      }
    } else if (offset && response.status === 200) offset = 0
    if (response.status !== (offset ? 206 : 200) || !response.body) {
      await response.body?.cancel()
      throw new DownloadError('语音资源下载失败，请检查网络后重试。', response.status === 429 || response.status >= 500)
    }
    const length = response.headers.get('content-length')
    if (length && Number(length) !== spec.archiveBytes - offset) { await response.body.cancel(); throw new DownloadError('语音资源下载大小与版本清单不符。') }
    const freshTag = response.headers.get('etag')
    if (freshTag?.startsWith('"') && freshTag.endsWith('"')) await writeFile(metadata, JSON.stringify({ sha256: spec.sha256, etag: freshTag }))
    else await rm(metadata, { force: true })
    const file = await open(path, offset ? 'a' : 'w')
    let bytes = offset
    try {
      reader = response.body.getReader()
      options.onProgress(bytes)
      while (true) {
        idle = setTimeout(() => controller.abort(new Error('语音资源下载长时间没有进度。')), options.idleTimeoutMs)
        const part = await reader.read()
        clearTimeout(idle); idle = undefined
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > spec.archiveBytes) throw new DownloadError('语音资源下载大小超过限制。')
        await file.writeFile(part.value)
        options.onProgress(bytes)
      }
      if (bytes !== spec.archiveBytes) throw new DownloadError('语音资源下载未完成。', true)
    } finally { await file.close() }
    complete = true
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (typeof code === 'string' && ['EACCES', 'EPERM', 'ENOSPC', 'EISDIR', 'ENOTDIR', 'ENOENT', 'EROFS', 'EMFILE'].includes(code)) {
      throw new DownloadError('语音资源无法写入，请检查磁盘空间及目录权限后重试。')
    }
    throw error
  } finally {
    clearTimeout(idle)
    if (!complete) controller.abort(new Error('语音资源下载已停止。'))
    if (reader) await reader.cancel().catch(() => undefined)
    else if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined)
    options.signal.removeEventListener('abort', abort)
  }
}
export async function downloadResource(spec: RecordingResourceSpec, path: string, options: ResourceDownloadOptions): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  options.signal.throwIfAborted()
  try { if ((await stat(path)).size === spec.archiveBytes && await resourceHash(path, options.signal) === spec.sha256) return } catch (error) { if (options.signal.aborted) throw error }
  for (let attemptNumber = 0; attemptNumber < 3; attemptNumber++) {
    try { await attempt(spec, path, options); return }
    catch (error) {
      if (options.signal.aborted) throw options.signal.reason ?? error
      if (error instanceof DownloadError && !error.retryable || attemptNumber === 2) throw error
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(options.signal.reason) }
        const timer = setTimeout(() => { options.signal.removeEventListener('abort', abort); resolve() }, 500 * 2 ** attemptNumber)
        options.signal.addEventListener('abort', abort, { once: true })
        if (options.signal.aborted) abort()
      })
    }
  }
}
