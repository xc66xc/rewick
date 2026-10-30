import { captureError } from './capture-error'
import workletUrl from './pcm-worklet.ts?worker&url'

/** Both sources feed one silent PCM worklet; microphone audio is never monitored. */
export class MixedRecordingCapture {
  private streams: MediaStream[] = []
  private context: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private generation = 0
  private flushed: (() => void) | null = null

  constructor(private readonly readCaptureFailure?: () => Promise<string | null>) {}

  async start(onChunk: (buffer: ArrayBuffer) => void, onEnded: () => void): Promise<void> {
    const generation = ++this.generation
    try {
      for (const source of ['system', 'microphone'] as const) {
        const stream = await (source === 'system'
          ? navigator.mediaDevices.getDisplayMedia({ audio: true, video: { frameRate: 1 } })
          : navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }))
          .catch(async error => { throw await captureError(error, source, this.readCaptureFailure) })
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return }
        this.streams.push(stream)
        const tracks = stream.getAudioTracks()
        if (!tracks.some(track => track.readyState === 'live')) throw new Error(`未获得${source === 'system' ? '系统声音' : '麦克风'}，录音未开始。`)
        tracks.forEach(track => { track.onended = onEnded })
      }
      const context = new AudioContext({ latencyHint: 'interactive' })
      this.context = context
      await context.audioWorklet.addModule(workletUrl)
      if (generation !== this.generation) return
      const node = new AudioWorkletNode(context, 'copilot-pcm')
      this.node = node
      node.port.onmessage = (event: MessageEvent<{ type: string; buffer?: ArrayBuffer }>) => {
        if (event.data.type === 'flushed') this.flushed?.()
        else if (event.data.buffer) onChunk(event.data.buffer)
      }
      for (const stream of this.streams) {
        const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
        const gain = context.createGain()
        gain.gain.value = 0.5
        source.connect(gain).connect(node)
      }
      node.connect(context.destination)
      await context.resume()
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    this.generation++
    const node = this.node
    this.node = null
    if (node) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 300)
        this.flushed = () => { clearTimeout(timer); resolve() }
        node.port.postMessage('flush')
      })
      node.port.onmessage = null
      node.port.close()
      node.disconnect()
      this.flushed = null
    }
    this.streams.forEach(stream => stream.getTracks().forEach(track => { track.onended = null; track.stop() }))
    this.streams = []
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') await context.close()
  }
}
