import { Pcm16Encoder } from './pcm-encoder'

declare const sampleRate: number
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void

class PcmProcessor extends AudioWorkletProcessor {
  private encoder = new Pcm16Encoder(sampleRate)
  private stopped = false
  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data !== 'flush') return
      this.stopped = true
      const buffer = this.encoder.flush()
      if (buffer) this.port.postMessage({ type: 'audio', buffer, level: 0 }, [buffer])
      this.port.postMessage({ type: 'flushed' })
    }
  }

  process(inputs: Float32Array[][]): boolean {
    if (this.stopped) return false
    const channels = inputs[0]
    if (!channels?.length) return true
    const channel = channels[0]
    let power = 0
    for (const value of channel) power += value * value
    const level = Math.min(1, Math.sqrt(power / Math.max(1, channel.length)) * 4)
    for (const buffer of this.encoder.push(channels)) {
      this.port.postMessage({ type: 'audio', buffer, level }, [buffer])
    }
    return true
  }
}

registerProcessor('copilot-pcm', PcmProcessor)
