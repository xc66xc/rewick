import { captureError } from './capture-error'
import workletUrl from './pcm-worklet.ts?worker&url'

interface WorkletMessage { type: 'audio' | 'flushed'; buffer?: ArrayBuffer; level?: number }
type CaptureSource = 'system' | 'microphone'

function requireLiveAudio(stream: MediaStream, source: CaptureSource): MediaStreamTrack[] {
  const tracks = stream.getAudioTracks()
  const label = source === 'system' ? '系统音频' : '麦克风'
  if (!tracks.length) throw new Error(`采集请求没有返回${label}音轨，请重新开始采集。`)
  const live = tracks.filter(track => track.readyState === 'live')
  if (!live.length) throw new Error(`${label}音轨已结束，请重新开始采集。`)
  return live
}

export class AudioCapture {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private generation = 0
  private flushResolve: (() => void) | null = null

  constructor(private readonly readCaptureFailure?: () => Promise<string | null>) {}

  async start(
    source: CaptureSource,
    onChunk: (audio: ArrayBuffer) => void,
    onLevel: (value: number) => void,
    onEnded: () => void
  ): Promise<void> {
    await this.stop()
    const generation = ++this.generation
    try {
      const stream = source === 'system'
        ? await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { frameRate: 1 } })
        : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return }
      this.stream = stream
      const audioTracks = requireLiveAudio(stream, source)
      for (const track of audioTracks) track.onended = () => { if (generation === this.generation) onEnded() }
      // Keep display tracks alive until stop in case the platform shares their capture session with audio.
      // Only audio enters the worklet; no video frames are read or stored.
      const context = new AudioContext({ latencyHint: 'interactive' })
      this.context = context
      await context.audioWorklet.addModule(workletUrl)
      if (generation !== this.generation) return
      const liveTracks = requireLiveAudio(stream, source)
      this.node = new AudioWorkletNode(context, 'copilot-pcm')
      this.node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
        if (event.data.type === 'flushed') { this.flushResolve?.(); return }
        if (generation !== this.generation) return
        if (event.data.buffer) onChunk(event.data.buffer)
        onLevel(event.data.level ?? 0)
      }
      this.source = context.createMediaStreamSource(new MediaStream(liveTracks))
      this.source.connect(this.node)
      // Worklet emits silence to the destination while passing PCM through its message port.
      this.node.connect(context.destination)
      await context.resume()
      if (generation !== this.generation) return
      requireLiveAudio(stream, source)
    } catch (error) {
      if (generation !== this.generation) return
      await this.stop().catch(() => undefined)
      throw await captureError(error, source, this.readCaptureFailure)
    }
  }

  async stop(): Promise<void> {
    const node = this.node
    this.node = null
    if (node) {
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 200)
        this.flushResolve = () => { clearTimeout(timeout); resolve() }
        node.port.postMessage('flush')
      })
      this.flushResolve = null
      node.port.onmessage = null
      node.disconnect()
      node.port.close()
    }
    this.generation++
    this.source?.disconnect()
    this.source = null
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    this.stream = null
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') await context.close()
  }
}
