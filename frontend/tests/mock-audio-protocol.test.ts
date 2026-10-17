import { describe, expect, it } from 'vitest'
import { decodeMockAudio, encodeMockAudio, mockCommandSchema } from '../src/shared/mock-interview'
const id = '12345678-1234-4234-8234-123456789012'
describe('mock interview binary transport', () => {
  it('roundtrips raw UUID, direction, generation, sequence and PCM in 28 LE header', () => {
    const pcm = new Int16Array([-32768, 0, 32767]).buffer
    const frame = encodeMockAudio(0, 0x12345678, id, 256, pcm)
    expect([...new Uint8Array(frame).slice(0, 8)]).toEqual([77, 73, 1, 0, 120, 86, 52, 18])
    expect(decodeMockAudio(frame)).toEqual({ direction: 0, generation: 0x12345678, id, sequence: 256, pcm })
    expect(frame.byteLength).toBe(34)
  })
  it.each([0, 27, 29, 65566])('rejects invalid frame length %d', length => { expect(() => decodeMockAudio(new ArrayBuffer(length))).toThrow('音频帧无效') })
  it('rejects invalid protocol and direction', () => {
    for (const [position, value] of [[0, 0], [2, 2], [3, 3]]) { const frame = encodeMockAudio(1, 1, id, 0, new ArrayBuffer(4)); new Uint8Array(frame)[position] = value; expect(() => decodeMockAudio(frame)).toThrow() }
  })
  it('rejects odd PCM and excessive payload', () => { expect(() => encodeMockAudio(0, 1, id, 0, new ArrayBuffer(1))).toThrow(); expect(() => encodeMockAudio(0, 1, id, 0, new ArrayBuffer(65538))).toThrow() })
  it('does not allow arbitrary command properties or negative versions', () => { expect(mockCommandSchema.safeParse({ requestId: id, expectedVersion: -1, command: 'start' }).success).toBe(false); expect(mockCommandSchema.safeParse({ requestId: id, expectedVersion: 1, command: 'start', apiKey: 'secret' }).success).toBe(false) })
})
