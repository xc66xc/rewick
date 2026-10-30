type CaptureSource = 'system' | 'microphone'

/** Main-process diagnosis takes precedence over Chromium's generic capture error. */
export async function captureError(error: unknown, source: CaptureSource,
  readFailure?: () => Promise<string | null>): Promise<Error> {
  if (source === 'system' && readFailure) {
    const failure = await readFailure().catch(() => null)
    if (failure?.trim()) return new Error(failure)
  }
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'NotAllowedError') return new Error(source === 'system'
    ? '系统音频采集被取消或拒绝。请重试；若仍失败，请检查 macOS 的屏幕与系统音频录制授权。'
    : '麦克风采集被取消或拒绝。请重试，并检查系统的麦克风授权。')
  if (/invalid capture constraints/i.test(message)) return new Error(source === 'system'
    ? '系统音频采集无法启动。请重试；若仍失败，请检查录屏与系统录音授权，并重新添加当前版本的应用。'
    : '麦克风采集无法启动。请检查麦克风设备与授权后重试。')
  if (name === 'NotFoundError') return new Error(source === 'system'
    ? '找不到可用的系统音频采集源，请重新开始采集。'
    : '找不到可用的麦克风，请检查设备连接后重试。')
  return error instanceof Error ? error : new Error(message)
}
