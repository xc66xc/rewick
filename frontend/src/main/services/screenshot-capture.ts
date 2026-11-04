interface Size { width: number; height: number }
interface CaptureImage {
  isEmpty(): boolean
  getSize(): Size
  resize(size: Size): CaptureImage
  toJPEG(quality: number): Buffer
}
interface Display { id: number; bounds: Size; scaleFactor: number }
export interface ScreenshotCaptureHost {
  platform: NodeJS.Platform
  screenPermission(): string
  displayAtCursor(): Display
  getSources(size: Size): Promise<{ display_id: string; thumbnail: CaptureImage }[]>
}

/** Capture a single mouse-selected display without touching ongoing audio capture. */
export async function captureFullscreen(host: ScreenshotCaptureHost, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const permissionMessage = '截图需要屏幕录制权限。请在系统设置 → 隐私与安全性 → 屏幕与系统音频录制中允许掌灯 Rewick，然后重新打开应用。'
  if (host.platform === 'darwin' && ['denied', 'restricted'].includes(host.screenPermission())) throw new Error(permissionMessage)
  const display = host.displayAtCursor()
  const pixels = { width: Math.round(display.bounds.width * display.scaleFactor), height: Math.round(display.bounds.height * display.scaleFactor) }
  const ratio = Math.min(1, 2560 / Math.max(pixels.width, pixels.height))
  const size = { width: Math.max(1, Math.round(pixels.width * ratio)), height: Math.max(1, Math.round(pixels.height * ratio)) }
  let sources: Awaited<ReturnType<ScreenshotCaptureHost['getSources']>>
  let abort: () => void = () => undefined
  try {
    sources = await Promise.race([host.getSources(size), new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })])
  } catch { signal.throwIfAborted(); throw new Error('无法截取屏幕，请检查屏幕录制权限，或重新打开应用后重试。') }
  finally { signal.removeEventListener('abort', abort) }
  signal.throwIfAborted()
  if (host.platform === 'darwin' && host.screenPermission() !== 'granted') throw new Error(permissionMessage)
  let image = sources.find(source => source.display_id === String(display.id))?.thumbnail
  if (!image || image.isEmpty()) throw new Error('未能获取鼠标所在屏幕的画面，请将鼠标移到题目所在屏幕后重试。')
  const actual = image.getSize()
  if (!actual.width || !actual.height) throw new Error('截图为空，请检查屏幕录制权限后重试。')
  const actualRatio = Math.min(1, 2560 / Math.max(actual.width, actual.height))
  if (actualRatio < 1) image = image.resize({ width: Math.max(1, Math.round(actual.width * actualRatio)), height: Math.max(1, Math.round(actual.height * actualRatio)) })
  const jpeg = image.toJPEG(90)
  if (jpeg.byteLength === 0 || jpeg.byteLength > 6 * 1024 * 1024) throw new Error('截图超过识别容量，请降低屏幕分辨率后重试。')
  signal.throwIfAborted()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}
