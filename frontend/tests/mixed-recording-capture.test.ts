import { afterEach, describe, expect, it, vi } from 'vitest'
import { MixedRecordingCapture } from '../src/renderer/src/audio/mixed-recording-capture'

afterEach(() => vi.unstubAllGlobals())
function stream(audio: boolean) {
  const track = { readyState: 'live', stop: vi.fn(), onended: null }
  return { track, getTracks: () => [track], getAudioTracks: () => audio ? [track] : [] }
}
describe('mixed recording capture', () => {
  it('releases system capture when microphone permission is rejected', async () => {
    const system = stream(true)
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(system), getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(new MixedRecordingCapture().start(vi.fn(), vi.fn())).rejects.toThrow('denied')
    expect(system.track.stop).toHaveBeenCalled()
  })
  it('rejects screen sharing without system audio instead of silently recording half the interview', async () => {
    const system = stream(false)
    const microphone = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(system), getUserMedia: microphone } })
    await expect(new MixedRecordingCapture().start(vi.fn(), vi.fn())).rejects.toThrow('未获得系统声音')
    expect(system.track.stop).toHaveBeenCalled()
    expect(microphone).not.toHaveBeenCalled()
  })
  it('shows the main-process authorization diagnosis for failed system recording', async () => {
    const microphone = vi.fn()
    const readFailure = vi.fn(async () => '当前版本未获录屏与系统录音授权，请重新添加当前应用。')
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(new TypeError('Invalid capture constraints')), getUserMedia: microphone } })
    await expect(new MixedRecordingCapture(readFailure).start(vi.fn(), vi.fn())).rejects.toThrow('当前版本未获录屏与系统录音授权')
    expect(readFailure).toHaveBeenCalledTimes(1)
    expect(microphone).not.toHaveBeenCalled()
  })
  it.each(['empty', 'unavailable'])('explains invalid constraints when main-process diagnosis is %s', async mode => {
    const readFailure = vi.fn(async (): Promise<string | null> => {
      if (mode === 'unavailable') throw new Error('IPC unavailable')
      return null
    })
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(new TypeError('Invalid capture constraints')), getUserMedia: vi.fn() } })
    await expect(new MixedRecordingCapture(readFailure).start(vi.fn(), vi.fn())).rejects.toThrow('系统音频采集无法启动。请重试')
  })
  it('reports microphone denial without reusing an earlier system diagnosis and releases the stream', async () => {
    const system = stream(true)
    const readFailure = vi.fn(async () => '旧系统音频错误')
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(system), getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')) } })
    await expect(new MixedRecordingCapture(readFailure).start(vi.fn(), vi.fn())).rejects.toThrow('麦克风采集被取消或拒绝')
    expect(readFailure).not.toHaveBeenCalled()
    expect(system.track.stop).toHaveBeenCalled()
  })
  it('explains a missing microphone device and releases the granted system stream', async () => {
    const system = stream(true)
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(system), getUserMedia: vi.fn().mockRejectedValue(new DOMException('Missing device', 'NotFoundError')) } })
    await expect(new MixedRecordingCapture().start(vi.fn(), vi.fn())).rejects.toThrow('找不到可用的麦克风')
    expect(system.track.stop).toHaveBeenCalled()
  })
  it('discards a late permission result after stop', async () => {
    let resolve: (value: unknown) => void = () => undefined
    const pending = new Promise(done => { resolve = done })
    const system = stream(true)
    const microphone = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockReturnValue(pending), getUserMedia: microphone } })
    const capture = new MixedRecordingCapture()
    const start = capture.start(vi.fn(), vi.fn())
    await capture.stop(); resolve(system); await start
    expect(system.track.stop).toHaveBeenCalled()
    expect(microphone).not.toHaveBeenCalled()
  })
})
