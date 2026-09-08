/** Only platform work is registered; direct provider requests keep their own lifecycle. */
export class PlatformWork {
  private epoch = 0
  private changing = 0
  private readonly pending = new Set<() => void>()
  get revision(): number { return this.epoch }

  track(revision: number, cancel: () => void): () => void {
    if (revision !== this.epoch || this.changing > 0) {
      cancel()
      throw new Error('平台连接已更改，本次请求已取消。')
    }
    this.pending.add(cancel)
    return () => { this.pending.delete(cancel) }
  }

  beginChange(): () => void {
    this.changing++
    this.invalidate()
    let finished = false
    return () => {
      if (finished) return
      finished = true
      this.changing--
      this.invalidate()
    }
  }

  invalidate(): void {
    this.epoch++
    const callbacks = [...this.pending]
    this.pending.clear()
    for (const cancel of callbacks) cancel()
  }
}
