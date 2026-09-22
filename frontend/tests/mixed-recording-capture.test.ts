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
