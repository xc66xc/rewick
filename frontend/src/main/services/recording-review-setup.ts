import { access } from 'node:fs/promises'
import { join } from 'node:path'
import manifestJson from '../../shared/recording-resources.json'
import type { RecordingResourceProgress, RecordingResourceStatus } from '../../shared/recording-types'
import { RecordingResourceManager, type RecordingResourceSpec } from './recording-resource-manager'
import { recordingReviewRuntime } from './interview-recording-review'

interface SetupOptions { isPackaged: boolean; resourcesPath: string; appPath: string; userData: string; fetch?: typeof globalThis.fetch }
const manifest = manifestJson as { schemaVersion: number; runtimes: Record<string, RecordingResourceSpec>; model: RecordingResourceSpec | null }

/** Prepares only the optional recording review feature; ordinary startup performs no resource IO. */
export class RecordingReviewSetup {
  private manager?: RecordingResourceManager
  constructor(private readonly options: SetupOptions) {}
  private resources(): RecordingResourceManager {
    if (!this.manager) {
      const target = `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`
      const runtime = manifest.runtimes[target]
      if (manifest.schemaVersion !== 1 || !runtime || !manifest.model) throw new Error('当前客户端缺少此平台的语音资源清单，请安装正式发布的客户端。')
      this.manager = new RecordingResourceManager({ root: join(this.options.userData, 'shared-resources'), runtime, model: manifest.model, fetch: this.options.fetch })
    }
    return this.manager
  }
  private async developmentRuntime() {
    const paths = recordingReviewRuntime(this.options)
    try { await access(paths.pythonPath); await access(join(paths.modelPath, 'model.bin')) }
    catch { throw new Error('开发环境语音资源尚未准备，请先运行 npm run prepare:recording。') }
    return paths
  }
  async status(): Promise<RecordingResourceStatus> {
    if (this.options.isPackaged) return this.resources().status()
    await this.developmentRuntime()
    return { ready: true, downloadBytes: 0, requiredBytes: 0 }
  }
  async ensure(allowDownload: boolean, signal: AbortSignal, onProgress: (progress: RecordingResourceProgress) => void) {
    signal.throwIfAborted()
    if (!this.options.isPackaged) return this.developmentRuntime()
    const resources = this.resources()
    if (!(await resources.status()).ready && !allowDownload) throw new Error('需要先下载本地语音资源，请在录音页面确认后继续。')
    const resourcePaths = await resources.ensure(signal, onProgress)
    signal.throwIfAborted()
    return recordingReviewRuntime({ ...this.options, resourcePaths })
  }
  async invalidate(): Promise<void> { if (this.options.isPackaged) await this.resources().invalidate() }
}
