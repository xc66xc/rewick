import { describe, expect, it, vi } from 'vitest'
import { captureFullscreen, type ScreenshotCaptureHost } from '../../src/main/services/screenshot-capture'

function image(width = 1920, height = 1080, bytes = Buffer.from('jpeg')) {
  return { isEmpty: () => false, getSize: () => ({ width, height }), resize: vi.fn(() => image(2560, 1440, bytes)), toJPEG: vi.fn(() => bytes) }
}
function host(): ScreenshotCaptureHost {
  return { platform: 'win32', screenPermission: () => 'granted', displayAtCursor: () => ({ id: 2, bounds: { width: 1920, height: 1080 }, scaleFactor: 2 }), getSources: vi.fn(async () => [{ display_id: '1', thumbnail: image(800, 600, Buffer.from('wrong')) }, { display_id: '2', thumbnail: image() }]) }
}
describe('full-screen screenshot capture', () => {
  it('captures only the mouse-selected display and bounds HiDPI thumbnail size', async () => {
    const value = host()
    const captured = await captureFullscreen(value, new AbortController().signal)
    expect(captured).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`)
    expect(value.getSources).toHaveBeenCalledExactlyOnceWith({ width: 2560, height: 1440 })
  })
  it('explains macOS screen permission before touching capture', async () => {
    const value = host(); value.platform = 'darwin'; value.screenPermission = () => 'denied'
    await expect(captureFullscreen(value, new AbortController().signal)).rejects.toThrow('屏幕录制权限')
    expect(value.getSources).not.toHaveBeenCalled()
  })
  it('attempts first capture so macOS can request permission, but never uploads denied frames', async () => {
    const value = host(); value.platform = 'darwin'; value.screenPermission = () => 'not-determined'
    await expect(captureFullscreen(value, new AbortController().signal)).rejects.toThrow('屏幕录制权限')
    expect(value.getSources).toHaveBeenCalledTimes(1)
    value.screenPermission = vi.fn().mockReturnValueOnce('not-determined').mockReturnValue('granted')
    await expect(captureFullscreen(value, new AbortController().signal)).resolves.toContain('data:image/jpeg')
  })
  it('does not silently capture a different monitor when the selected display disappears', async () => {
    const value = host(); value.getSources = vi.fn(async () => [{ display_id: '1', thumbnail: image() }])
    await expect(captureFullscreen(value, new AbortController().signal)).rejects.toThrow('鼠标所在屏幕')
  })
  it('releases the caller immediately when native capture is still pending', async () => {
    const value = host(), controller = new AbortController()
    value.getSources = () => new Promise(() => undefined)
    const pending = captureFullscreen(value, controller.signal)
    controller.abort(new Error('用户已取消'))
    await expect(pending).rejects.toThrow('用户已取消')
  })
  it('aborts after a pending capture without returning or uploading image data', async () => {
    const value = host(), controller = new AbortController()
    value.getSources = async () => { controller.abort(new Error('cancelled')); return [{ display_id: '2', thumbnail: image() }] }
    await expect(captureFullscreen(value, controller.signal)).rejects.toThrow('cancelled')
  })
  it('rejects empty and oversized encoded screenshots', async () => {
    const value = host()
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(6 * 1024 * 1024 + 1)]) {
      value.getSources = async () => [{ display_id: '2', thumbnail: image(1920, 1080, bytes) }]
      await expect(captureFullscreen(value, new AbortController().signal)).rejects.toThrow('容量')
    }
  })
})
