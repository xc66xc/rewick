import { describe, expect, it } from 'vitest'
import { Pcm16Encoder } from '../src/renderer/src/audio/pcm-encoder'

function encode(rate: number, chunks: number[]): number[] {
  const encoder = new Pcm16Encoder(rate, 160)
  const output: ArrayBuffer[] = []
  for (const length of chunks) output.push(...encoder.push([new Float32Array(length).fill(0.5)]))
  const last = encoder.flush()
  if (last) output.push(last)
  return output.flatMap(frame => [...new Int16Array(frame)])
}
describe('continuous PCM audio', () => {
  it('preserves 16kHz timing across 128-sample render boundaries at 48kHz', () => {
    const chunks = Array.from({ length: 375 }, () => 128)
    const samples = encode(48000, chunks)
    expect(samples).toHaveLength(16000)
    expect(new Set(samples)).toEqual(new Set([16384]))
  })
  it('preserves fractional positions across 44.1kHz input chunks', () => {
    expect(encode(44100, [128, 500, 9000, 34472])).toEqual(encode(44100, [44100]))
    expect(encode(44100, [44100])).toHaveLength(16000)
  })
  it('downmixes stereo and flushes the last short PCM frame once', () => {
    const encoder = new Pcm16Encoder(16000)
    expect(encoder.push([new Float32Array([1, -1]), new Float32Array([-1, 1])])).toEqual([])
    expect([...new Int16Array(encoder.flush() ?? new ArrayBuffer(0))]).toEqual([0, 0])
    expect(encoder.flush()).toBeNull()
  })
})
