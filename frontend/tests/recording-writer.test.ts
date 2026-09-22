import { describe, expect, it, vi } from 'vitest'
import { RecordingWriter } from '../src/renderer/src/audio/recording-writer'

describe('local recording write queue', () => {
  it('preserves chunk order and waits for disk acknowledgement before finishing', async () => {
    let resolve: () => void = () => undefined
    const waiting = new Promise<void>(done => { resolve = done })
    const write = vi.fn().mockImplementationOnce(() => waiting).mockResolvedValue(undefined)
    const writer = new RecordingWriter(write, vi.fn())
    const first = new ArrayBuffer(4), second = new ArrayBuffer(6)
    writer.append(first); writer.append(second)
    await Promise.resolve()
    expect(write).toHaveBeenCalledTimes(1)
    resolve(); await writer.finish()
    expect(write.mock.calls.map(call => call[0])).toEqual([first, second])
  })
  it('stops accepting data when writes cannot keep up', async () => {
    const failure = vi.fn()
    const writer = new RecordingWriter(vi.fn().mockResolvedValue(undefined), failure)
    writer.append(new ArrayBuffer(320_000)); writer.append(new ArrayBuffer(2)); writer.append(new ArrayBuffer(2))
    expect(failure).toHaveBeenCalledTimes(1)
    await expect(writer.finish()).rejects.toThrow('录音写入过慢')
  })
  it('reports disk failure and rejects finalization', async () => {
    const failure = vi.fn()
    const writer = new RecordingWriter(vi.fn().mockRejectedValue(new Error('disk full')), failure)
    writer.append(new ArrayBuffer(2))
    await expect(writer.finish()).rejects.toThrow('disk full')
    expect(failure).toHaveBeenCalledTimes(1)
  })
})
