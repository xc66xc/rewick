declare const sampleRate: number
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void
class MockPlaybackProcessor extends AudioWorkletProcessor {
  private queue: Int16Array[] = []
  private offset = 0
  private fraction = 0
  private queued = 0
  private consumed = 0
  private ended = false
  private drained = false
  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<{ type: string; pcm?: ArrayBuffer }>) => {
      if (event.data.type === 'stop') { this.queue = []; this.offset = 0; this.fraction = 0; this.queued = 0; this.ended = false; this.drained = false }
      if (event.data.type === 'end') this.ended = true
      if (event.data.type === 'audio' && event.data.pcm) {
        const samples = new Int16Array(event.data.pcm)
        if (this.queued + samples.length > 48000) { this.port.postMessage({ type: 'overflow' }); return }
        this.queue.push(samples); this.queued += samples.length; this.drained = false
      }
    }
  }
  process(_input: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0]?.[0]
    if (!output) return true
    for (let i = 0; i < output.length; i++) {
      const first = this.queue[0]
      output[i] = first ? (first[this.offset] ?? 0) / 32768 : 0
      if (!first) continue
      this.fraction += 24000 / sampleRate
      while (this.fraction >= 1 && this.queue.length) {
        this.fraction--; this.offset++; this.queued--; this.consumed += 2
        if (this.offset >= this.queue[0].length) { this.queue.shift(); this.offset = 0 }
      }
    }
    if (this.consumed >= 4800 || (!this.queued && this.consumed)) { this.port.postMessage({ type: 'consumed', bytes: this.consumed }); this.consumed = 0 }
    if (this.ended && !this.queued && !this.drained) { this.drained = true; this.port.postMessage({ type: 'drained' }) }
    return true
  }
}
registerProcessor('mock-pcm-playback', MockPlaybackProcessor)
