import workletUrl from './pcm-playback-worklet.ts?worker&url'
export class MockTtsPlayer {
  private context?: AudioContext
  private node?: AudioWorkletNode
  private analyser?: AnalyserNode
  private epoch = 0
  private animation?: number
  async start(onDrained: () => void, onCredit: (bytes: number) => void, onLevel: (level: number) => void, onError: (message: string) => void) {
    this.stop(); const epoch = this.epoch
    const context = new AudioContext({ latencyHint: 'interactive' }); this.context = context
    await context.audioWorklet.addModule(workletUrl)
    if (epoch !== this.epoch) return
    const node = new AudioWorkletNode(context, 'mock-pcm-playback'); this.node = node
    const analyser = context.createAnalyser(); analyser.fftSize = 256; this.analyser = analyser
    node.connect(analyser); analyser.connect(context.destination)
    node.port.onmessage = (event: MessageEvent<{ type: string; bytes?: number }>) => {
      if (epoch !== this.epoch) return
      if (event.data.type === 'drained') onDrained()
      if (event.data.type === 'consumed' && event.data.bytes) onCredit(event.data.bytes)
      if (event.data.type === 'overflow') onError('语音播放积压，已停止播放，请暂停后重试。')
    }
    const values = new Float32Array(analyser.fftSize)
    let last = 0
    const animate = (time: number) => {
      if (epoch !== this.epoch) return
      if (document.hidden) onLevel(0)
      else if (time - last >= 50) { last = time; analyser.getFloatTimeDomainData(values); onLevel(Math.min(1, Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) * 5)) }
      this.animation = requestAnimationFrame(animate)
    }
    this.animation = requestAnimationFrame(animate)
    await context.resume()
  }
  push(pcm: ArrayBuffer) { if (!this.node) throw new Error('语音播放器尚未准备好。'); this.node.port.postMessage({ type: 'audio', pcm }, [pcm]) }
  end() { this.node?.port.postMessage({ type: 'end' }) }
  stop() {
    this.epoch++; if (this.animation) cancelAnimationFrame(this.animation)
    this.node?.port.postMessage({ type: 'stop' }); this.node?.disconnect(); this.node?.port.close(); this.node = undefined
    this.analyser?.disconnect(); this.analyser = undefined
    const context = this.context; this.context = undefined
    if (context && context.state !== 'closed') void context.close().catch(error => console.error('模拟语音播放器关闭失败', error))
  }
}
