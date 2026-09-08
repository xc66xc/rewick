/** Stateful area resampling preserves fractional sample positions across render quanta. */
export class Pcm16Encoder {
  private readonly ratio: number
  private area = 0
  private filled = 0
  private samples: number[] = []
  constructor(inputRate: number, private readonly frameSize = 1600, outputRate = 16000) {
    if (inputRate <= 0 || outputRate <= 0 || frameSize < 1) throw new Error('Invalid audio format')
    this.ratio = inputRate / outputRate
  }

  push(channels: Float32Array[]): ArrayBuffer[] {
    const frames: ArrayBuffer[] = []
    const length = channels[0]?.length ?? 0
    for (let i = 0; i < length; i++) {
      let value = 0
      for (const channel of channels) value += channel[i] ?? 0
      value /= channels.length
      let remaining = 1
      while (remaining > 1e-8) {
        const weight = Math.min(remaining, this.ratio - this.filled)
        this.area += value * weight
        this.filled += weight
        remaining -= weight
        if (this.filled >= this.ratio - 1e-8) {
          this.samples.push(this.toInt16(this.area / this.ratio))
          this.area = 0
          this.filled = 0
          if (this.samples.length === this.frameSize) frames.push(this.takeFrame())
        }
      }
    }
    return frames
  }

  flush(): ArrayBuffer | null {
    if (this.filled > 1e-8) this.samples.push(this.toInt16(this.area / this.filled))
    this.area = 0
    this.filled = 0
    return this.samples.length ? this.takeFrame() : null
  }

  private toInt16(value: number): number {
    const bounded = Math.max(-1, Math.min(1, value))
    return Math.round(bounded * (bounded < 0 ? 32768 : 32767))
  }

  private takeFrame(): ArrayBuffer {
    const buffer = new ArrayBuffer(this.samples.length * 2)
    const view = new DataView(buffer)
    this.samples.forEach((sample, index) => view.setInt16(index * 2, sample, true))
    this.samples = []
    return buffer
  }
}
