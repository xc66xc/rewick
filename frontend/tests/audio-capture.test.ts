import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioCapture } from '../src/renderer/src/audio/capture'

vi.mock('../src/renderer/src/audio/pcm-worklet.ts?worker&url', () => ({ default: '/mock-pcm-worklet.js' }))

class FakeTrack {
  readyState: 'live' | 'ended' = 'live'
  onended: (() => void) | null = null
  constructor(readonly kind: 'audio' | 'video') {}
  stop = vi.fn(() => { this.readyState = 'ended' })
  end() { this.readyState = 'ended'; this.onended?.() }
}

class FakeStream {
  constructor(readonly tracks: FakeTrack[] = []) {}
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  getTracks() { return this.tracks }
}

interface PortMessage { data: { type: 'flushed' | 'audio'; buffer?: ArrayBuffer; level?: number } }
class FakeWorklet {
  static instances: FakeWorklet[] = []
  readonly port = {
    onmessage: null as ((message: PortMessage) => void) | null,
    postMessage: vi.fn((message: string) => {
      if (message === 'flush') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'flushed' } }))
    }),
    close: vi.fn(),
  }
  connect = vi.fn()
  disconnect = vi.fn()
  constructor() { FakeWorklet.instances.push(this) }
}

let addModule: () => Promise<void>
let resumeContext: () => Promise<void>
class FakeContext {
  static instances: FakeContext[] = []
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  destination = {}
  audioWorklet = { addModule: vi.fn(() => addModule()) }
  audioSource = { connect: vi.fn(), disconnect: vi.fn() }
  createMediaStreamSource = vi.fn(() => this.audioSource)
  resume = vi.fn(async () => { await resumeContext(); if (this.state !== 'closed') this.state = 'running' })
  close = vi.fn(async () => { this.state = 'closed' })
  constructor() { FakeContext.instances.push(this) }
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

const mediaDevices = { getDisplayMedia: vi.fn<() => Promise<FakeStream>>(), getUserMedia: vi.fn<() => Promise<FakeStream>>() }
let audio: FakeTrack
let video: FakeTrack
let stream: FakeStream
const callbacks = () => [vi.fn(), vi.fn(), vi.fn()] as const

beforeEach(() => {
  vi.clearAllMocks()
  addModule = async () => undefined
  resumeContext = async () => undefined
  FakeContext.instances = []
  FakeWorklet.instances = []
  audio = new FakeTrack('audio')
  video = new FakeTrack('video')
  stream = new FakeStream([audio, video])
  mediaDevices.getDisplayMedia.mockResolvedValue(stream)
  mediaDevices.getUserMedia.mockResolvedValue(new FakeStream([audio]))
  vi.stubGlobal('navigator', { mediaDevices })
  vi.stubGlobal('MediaStream', FakeStream)
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('AudioWorkletNode', FakeWorklet)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('AudioCapture startup failures', () => {
  it.each(['system', 'microphone'] as const)('explains missing %s audio without assuming permission denial and releases every track', async source => {
    const empty = new FakeStream(source === 'system' ? [video] : [])
    mediaDevices.getDisplayMedia.mockResolvedValue(empty)
    mediaDevices.getUserMedia.mockResolvedValue(empty)
    const capture = new AudioCapture()

    await expect(capture.start(source, ...callbacks())).rejects.toThrow(source === 'system' ? '没有返回系统音频音轨' : '没有返回麦克风音轨')
    expect(FakeContext.instances).toHaveLength(0)
    for (const track of empty.getTracks()) expect(track.stop).toHaveBeenCalled()
  })

  it.each(['system', 'microphone'] as const)('rejects an already ended %s track before claiming capture has started', async source => {
    audio.readyState = 'ended'
    await expect(new AudioCapture().start(source, ...callbacks())).rejects.toThrow(source === 'system' ? '系统音频音轨已结束' : '麦克风音轨已结束')
    expect(FakeContext.instances).toHaveLength(0)
    expect(audio.stop).toHaveBeenCalled()
  })

  it('prefers the concrete main-process diagnosis for a system capture failure', async () => {
    mediaDevices.getDisplayMedia.mockRejectedValue(new Error('Invalid capture constraints'))
    const readFailure = vi.fn(async () => '系统录制授权与当前应用签名不匹配，请重新授权。')

    await expect(new AudioCapture(readFailure).start('system', ...callbacks())).rejects.toThrow('系统录制授权与当前应用签名不匹配')
    expect(readFailure).toHaveBeenCalledTimes(1)
  })

  it.each(['system', 'microphone'] as const)('describes cancelled or denied %s capture without declaring that permission is disabled', async source => {
    const denied = new DOMException('Permission denied', 'NotAllowedError')
    mediaDevices.getDisplayMedia.mockRejectedValue(denied)
    mediaDevices.getUserMedia.mockRejectedValue(denied)
    const readFailure = vi.fn(async () => null)

    await expect(new AudioCapture(readFailure).start(source, ...callbacks())).rejects.toThrow(source === 'system' ? '系统音频采集被取消或拒绝' : '麦克风采集被取消或拒绝')
    expect(readFailure).toHaveBeenCalledTimes(source === 'system' ? 1 : 0)
  })

  it('keeps the original constraints error when the diagnosis lookup fails', async () => {
    mediaDevices.getDisplayMedia.mockRejectedValue(new TypeError('Invalid capture constraints'))
    const readFailure = vi.fn(async (): Promise<string | null> => { throw new Error('diagnostics unavailable') })

    await expect(new AudioCapture(readFailure).start('system', ...callbacks())).rejects.toThrow('系统音频采集无法启动：Invalid capture constraints')
  })
})

describe('AudioCapture asynchronous initialization', () => {
  it('releases a stream granted after the user has stopped initialization', async () => {
    const granted = deferred<FakeStream>()
    mediaDevices.getDisplayMedia.mockReturnValue(granted.promise)
    const capture = new AudioCapture()
    const starting = capture.start('system', ...callbacks())
    await vi.waitFor(() => expect(mediaDevices.getDisplayMedia).toHaveBeenCalled())

    await capture.stop()
    granted.resolve(stream)
    await expect(starting).resolves.toBeUndefined()
    expect(audio.stop).toHaveBeenCalled()
    expect(video.stop).toHaveBeenCalled()
    expect(FakeContext.instances).toHaveLength(0)
  })

  it('cleans up and does not create an audio worklet after stopping during module loading', async () => {
    const loaded = deferred<void>()
    addModule = () => loaded.promise
    const capture = new AudioCapture()
    const starting = capture.start('system', ...callbacks())
    await vi.waitFor(() => expect(FakeContext.instances[0]?.audioWorklet.addModule).toHaveBeenCalled())

    await capture.stop()
    loaded.resolve()
    await expect(starting).resolves.toBeUndefined()
    expect(FakeContext.instances[0]?.state).toBe('closed')
    expect(FakeWorklet.instances).toHaveLength(0)
    expect(audio.stop).toHaveBeenCalled()
    expect(video.stop).toHaveBeenCalled()
  })

  it('cleans up a worklet when stopped while audio context resume is pending', async () => {
    const resumed = deferred<void>()
    resumeContext = () => resumed.promise
    const capture = new AudioCapture()
    const [onChunk, onLevel, onEnded] = callbacks()
    const starting = capture.start('system', onChunk, onLevel, onEnded)
    await vi.waitFor(() => expect(FakeContext.instances[0]?.resume).toHaveBeenCalled())

    await capture.stop()
    resumed.resolve()
    await expect(starting).resolves.toBeUndefined()
    expect(FakeContext.instances[0]?.state).toBe('closed')
    expect(FakeWorklet.instances[0]?.port.onmessage).toBeNull()
    expect(FakeWorklet.instances[0]?.port.close).toHaveBeenCalled()
    expect(onChunk).not.toHaveBeenCalled()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it.each(['module', 'resume'] as const)('rejects audio that ends during %s initialization', async stage => {
    const completed = deferred<void>()
    if (stage === 'module') addModule = () => completed.promise
    else resumeContext = () => completed.promise
    const capture = new AudioCapture()
    const [onChunk, onLevel, onEnded] = callbacks()
    const starting = capture.start('system', onChunk, onLevel, onEnded)
    const rejected = expect(starting).rejects.toThrow('系统音频音轨已结束')
    await vi.waitFor(() => expect(stage === 'module' ? FakeContext.instances[0]?.audioWorklet.addModule : FakeContext.instances[0]?.resume).toHaveBeenCalled())

    audio.end()
    completed.resolve()
    await rejected
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(FakeContext.instances[0]?.state).toBe('closed')
    expect(video.stop).toHaveBeenCalled()
  })

  it('keeps the display track alive while audio is running and releases both tracks on stop', async () => {
    const capture = new AudioCapture()
    await capture.start('system', ...callbacks())
    expect(video.stop).not.toHaveBeenCalled()
    expect(audio.readyState).toBe('live')

    await capture.stop()
    expect(video.stop).toHaveBeenCalledTimes(1)
    expect(audio.stop).toHaveBeenCalledTimes(1)
    expect(audio.onended).toBeNull()
    expect(FakeContext.instances[0]?.state).toBe('closed')
  })
})
