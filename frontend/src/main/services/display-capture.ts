import type { DesktopCapturerSource, Streams } from 'electron'

interface CaptureDependencies {
  getSources(): Promise<DesktopCapturerSource[]>
  screenPermission(): string
}

export const screenPermissionMessage = 'macOS 未授权当前版本的录屏与系统录音。若开关已经开启，请退出应用，在系统设置 → 隐私与安全性 → 录屏与系统录音中移除旧的 掌灯 Rewick，再用「＋」添加当前应用并重新打开。'

/** Keep the real failure: Electron turns an empty display grant into Invalid capture constraints. */
export class DisplayCaptureService {
  private failure: string | null = null

  constructor(private readonly dependencies: CaptureDependencies) {}

  getFailure(): string | null { return this.failure }

  async grant(trusted: boolean, wantsAudio: boolean, callback: (streams: Streams) => void): Promise<void> {
    this.failure = null
    let streams: Streams = {}
    try {
      if (!trusted) throw new Error('系统音频请求已失效，请重新开始转写。')
      const permission = this.dependencies.screenPermission()
      if (permission === 'denied') throw new Error(screenPermissionMessage)
      if (permission === 'restricted') throw new Error('系统策略限制了录屏与系统录音，请联系设备管理员。')
      const sources = await this.dependencies.getSources()
      const video = sources[0]
      if (!video) throw new Error('系统没有提供可用的屏幕音频来源。请完全退出后重新打开应用；若仍失败，请移除旧的录屏授权并重新添加当前应用。')
      streams = { video, ...(wantsAudio ? { audio: 'loopback' as const } : {}) }
    } catch (error) {
      const permission = this.dependencies.screenPermission()
      this.failure = trusted && permission === 'denied' ? screenPermissionMessage
        : error instanceof Error ? error.message : '系统音频采集失败，请重新启动应用后再试。'
    }
    // On denial Electron rejects the renderer request AND throws from this callback.
    // Invoke exactly once; never retry the callback from a Promise.catch handler.
    try { callback(streams) }
    catch (error) {
      this.failure ??= error instanceof Error ? `系统音频采集失败：${error.message}` : '系统音频采集失败。'
    }
  }
}
