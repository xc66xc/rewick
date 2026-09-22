/** Bounded IPC write queue: disk acknowledgement controls how much PCM is retained. */
export class RecordingWriter {
  private pending = Promise.resolve()
  private bytes = 0
  private failure: unknown
  constructor(private readonly write: (buffer: ArrayBuffer) => Promise<void>, private readonly onFailure: (error: unknown) => void) {}
  append(buffer: ArrayBuffer): void {
    if (this.failure) return
    if (this.bytes + buffer.byteLength > 320_000) {
      this.failure = new Error('录音写入过慢，已停止录音以保护已保存的内容。')
      this.onFailure(this.failure)
      return
    }
    this.bytes += buffer.byteLength
    this.pending = this.pending.then(async () => {
      if (!this.failure) await this.write(buffer)
    }).catch(error => { if (!this.failure) { this.failure = error; this.onFailure(error) } })
      .finally(() => { this.bytes -= buffer.byteLength })
  }
  async finish(): Promise<void> { await this.pending; if (this.failure) throw this.failure }
}
