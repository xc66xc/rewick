import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkResourceFiles, extractResource, makePythonExecutable, resourceHash, type RecordingResourceSpec } from './recording-resource-archive'
import { downloadResource } from './recording-resource-download'

export type { RecordingResourceSpec } from './recording-resource-archive'
export interface RecordingResourceProgress {
  stage: 'downloading' | 'verifying' | 'extracting' | 'checking'
  resourceId: string
  downloadedBytes: number
  totalBytes: number
}
export interface RecordingResourceStatus { ready: boolean; downloadBytes: number; requiredBytes: number }
export interface RecordingResourcePaths { pythonPath: string; modelPath: string }
export interface RecordingResourceManagerOptions {
  root: string
  runtime: RecordingResourceSpec
  model: RecordingResourceSpec
  platform?: NodeJS.Platform
  fetch?: typeof globalThis.fetch
  freeBytes?: (root: string) => Promise<number>
  check?: (paths: RecordingResourcePaths, signal: AbortSignal) => Promise<void>
  connectionTimeoutMs?: number
  idleTimeoutMs?: number
  taskTimeoutMs?: number
}
function validate(spec: RecordingResourceSpec, kind: 'runtime' | 'model'): void {
  if (spec.kind !== kind || !/^[a-zA-Z0-9_-]{1,100}$/.test(spec.resourceId) || !/^[a-f0-9]{64}$/.test(spec.sha256)
    || !Number.isSafeInteger(spec.archiveBytes) || spec.archiveBytes <= 0 || spec.archiveBytes > 2 * 1024 ** 3
    || !Number.isSafeInteger(spec.unpackedBytes) || spec.unpackedBytes <= 0 || spec.unpackedBytes > 4 * 1024 ** 3
    || !Number.isSafeInteger(spec.maxEntries) || spec.maxEntries < 1 || spec.maxEntries > 100000
    || !spec.criticalFiles.length || spec.criticalFiles.some(file => !/^[a-f0-9]{64}$/.test(file.sha256))) throw new Error('本地语音资源版本清单无效，请更新客户端。')
}
async function checkPython(paths: RecordingResourcePaths, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await makePythonExecutable(paths.pythonPath)
  return new Promise((resolve, reject) => {
    const script = "import sys; import faster_whisper, ctranslate2; faster_whisper.WhisperModel(sys.argv[1], device='cpu', compute_type='int8', cpu_threads=1, local_files_only=True)"
    const child = spawn(paths.pythonPath, ['-I', '-B', '-c', script, paths.modelPath], {
      windowsHide: true, stdio: 'ignore', env: { ...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', ORT_DISABLE_TELEMETRY: '1' },
    })
    let forced: ReturnType<typeof setTimeout> | undefined
    let timeout = false
    const stop = () => { child.kill(); forced ??= setTimeout(() => child.kill('SIGKILL'), 2000) }
    const timer = setTimeout(() => { timeout = true; stop() }, 120000)
    const cleanup = () => { clearTimeout(timer); clearTimeout(forced); signal.removeEventListener('abort', stop) }
    signal.addEventListener('abort', stop, { once: true })
    if (signal.aborted) stop()
    child.once('error', () => { cleanup(); reject(new Error('无法启动本地语音环境，请重新下载资源。')) })
    child.once('close', code => {
      cleanup()
      if (signal.aborted) reject(signal.reason)
      else if (timeout) reject(new Error('本地语音环境检查超时，请重试。'))
      else if (code !== 0) reject(new Error('本地语音环境检查失败，请重新下载资源。'))
      else resolve()
    })
  })
}
export class RecordingResourceManager {
  private readonly specs: RecordingResourceSpec[]
  private active?: Promise<RecordingResourcePaths>
  private owner?: AbortSignal
  private logQueue = Promise.resolve()
  constructor(private readonly options: RecordingResourceManagerOptions) {
    validate(options.runtime, 'runtime'); validate(options.model, 'model')
    this.specs = [options.runtime, options.model]
  }
  private directory(spec: RecordingResourceSpec): string { return join(this.options.root, spec.kind, spec.sha256) }
  private paths(runtime = this.directory(this.options.runtime), model = this.directory(this.options.model)): RecordingResourcePaths {
    return { pythonPath: join(runtime, (this.options.platform ?? process.platform) === 'win32' ? 'python.exe' : 'bin/python3'), modelPath: model }
  }
  private async ready(spec: RecordingResourceSpec): Promise<boolean> {
    try {
      const marker = join(this.directory(spec), '.rewick-ready.json')
      if ((await stat(marker)).size > 4096) return false
      const value = JSON.parse(await readFile(marker, 'utf8')) as { sha256?: string }
      return value.sha256 === spec.sha256 && await checkResourceFiles(this.directory(spec), spec, false)
    } catch { return false }
  }
  async status(): Promise<RecordingResourceStatus> {
    const missing = []
    for (const spec of this.specs) if (!await this.ready(spec)) missing.push(spec)
    return { ready: !missing.length, downloadBytes: missing.reduce((sum, spec) => sum + spec.archiveBytes, 0),
      requiredBytes: missing.length ? missing.reduce((sum, spec) => sum + spec.archiveBytes + spec.unpackedBytes, 64 * 1024 ** 2) : 0 }
  }
  ensure(signal: AbortSignal, onProgress: (progress: RecordingResourceProgress) => void): Promise<RecordingResourcePaths> {
    if (this.active) return signal === this.owner ? this.active : Promise.reject(new Error('本地语音资源正在准备，请稍候。'))
    this.owner = signal
    const operation = this.prepare(signal, onProgress).finally(() => { if (this.active === operation) { this.active = undefined; this.owner = undefined } })
    this.active = operation
    return operation
  }
  async invalidate(): Promise<void> {
    if (this.active) throw new Error('本地语音资源正在准备，请稍候重试。')
    for (const spec of this.specs) await rm(join(this.directory(spec), '.rewick-ready.json'), { force: true })
    this.log('invalidated')
    await this.logQueue
  }
  private log(event: string, resourceId?: string, error?: unknown): void {
    const line = JSON.stringify({ at: new Date().toISOString(), label: error ? '[error][speech-resources]' : '[speech-resources]', event, resourceId,
      ...(error ? { errorType: error instanceof Error ? error.name : 'UnknownError' } : {}) }) + '\n'
    process.stderr.write(line)
    this.logQueue = this.logQueue.then(async () => {
      await mkdir(this.options.root, { recursive: true })
      const path = join(this.options.root, 'resource-manager.log')
      const length = await stat(path).then(value => value.size, error => {
        if (error.code === 'ENOENT') return 0
        throw error
      })
      if (length + Buffer.byteLength(line) > 256 * 1024) {
        await rm(`${path}.1`, { force: true }); await rename(path, `${path}.1`)
      }
      await appendFile(path, line, { mode: 0o600 })
    }).catch(() => { process.stderr.write('[error][speech-resources] log-write-failed\n') })
  }
  private async prepare(outerSignal: AbortSignal, onProgress: (progress: RecordingResourceProgress) => void): Promise<RecordingResourcePaths> {
    const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(this.options.taskTimeoutMs ?? 30 * 60 * 1000)])
    const staging = join(this.options.root, '.staging')
    const staged = new Map<RecordingResourceSpec, string>()
    let current: RecordingResourceSpec | undefined
    try {
      signal.throwIfAborted()
      const state = await this.status()
      if (state.ready) return this.paths()
      await mkdir(this.options.root, { recursive: true })
      await rm(staging, { recursive: true, force: true })
      const free = this.options.freeBytes ? await this.options.freeBytes(this.options.root) : await statfs(this.options.root).then(value => value.bavail * value.bsize)
      if (free < state.requiredBytes) throw new Error('磁盘空间不足，请释放空间后重新下载语音资源。')
      await mkdir(staging, { recursive: true })
      for (const spec of this.specs) {
        signal.throwIfAborted()
        if (await this.ready(spec)) continue
        current = spec
        const progress = (stage: RecordingResourceProgress['stage'], downloadedBytes: number) => onProgress({ stage, resourceId: spec.resourceId, downloadedBytes, totalBytes: spec.archiveBytes })
        const archive = join(this.options.root, '.downloads', `${spec.sha256}.tar.gz`)
        this.log('download-started', spec.resourceId)
        let lastProgress = 0
        await downloadResource(spec, archive, { fetch: this.options.fetch ?? globalThis.fetch, signal,
          connectionTimeoutMs: this.options.connectionTimeoutMs ?? 15000, idleTimeoutMs: this.options.idleTimeoutMs ?? 60000,
          onProgress: bytes => { if (bytes === spec.archiveBytes || Date.now() - lastProgress >= 100) { lastProgress = Date.now(); progress('downloading', bytes) } } })
        progress('verifying', spec.archiveBytes)
        if (await resourceHash(archive, signal) !== spec.sha256) {
          await rm(archive, { force: true }); await rm(`${archive}.etag`, { force: true })
          throw new Error('语音资源校验失败，请重试下载。')
        }
        const target = join(staging, `${spec.kind}-${randomUUID()}`)
        await mkdir(target)
        staged.set(spec, target)
        progress('extracting', spec.archiveBytes)
        await extractResource(archive, target, spec, signal)
        if (!await checkResourceFiles(target, spec, true, signal)) throw new Error('语音资源文件不完整，请重试下载。')
      }
      signal.throwIfAborted()
      const paths = this.paths(staged.get(this.options.runtime), staged.get(this.options.model))
      onProgress({ stage: 'checking', resourceId: 'speech', downloadedBytes: state.downloadBytes, totalBytes: state.downloadBytes })
      await (this.options.check ?? checkPython)(paths, signal)
      signal.throwIfAborted()
      for (const [spec, target] of staged) {
        signal.throwIfAborted()
        await writeFile(join(target, '.rewick-ready.json'), JSON.stringify({ sha256: spec.sha256 }))
        const destination = this.directory(spec)
        await mkdir(join(this.options.root, spec.kind), { recursive: true })
        // A damaged cache is never used. Keep other content-addressed versions untouched.
        await rm(destination, { recursive: true, force: true })
        await rename(target, destination)
        this.log('ready', spec.resourceId)
        const archive = join(this.options.root, '.downloads', `${spec.sha256}.tar.gz`)
        await rm(archive, { force: true }); await rm(`${archive}.etag`, { force: true })
      }
      return this.paths()
    } catch (error) {
      this.log(outerSignal.aborted ? 'cancelled' : 'failed', current?.resourceId, outerSignal.aborted ? undefined : error)
      if (outerSignal.aborted) throw new Error('已取消语音资源准备。')
      if (signal.aborted) throw new Error('语音资源准备超时，请检查网络后重试。')
      if (error instanceof Error && /^(磁盘空间不足|语音资源|本地语音|无法启动本地语音)/.test(error.message)) throw error
      throw new Error('语音资源准备失败，请检查网络和磁盘空间后重试。')
    } finally { await rm(staging, { recursive: true, force: true }); await this.logQueue }
  }
}
