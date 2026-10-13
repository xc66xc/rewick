import { describe, expect, it } from 'vitest'
import { environmentStampSchema, environmentStampInputSchema } from '../src/shared/environment-stamp'

describe('environment stamp contract', () => {
  it.each(['一面中', '已下 offer', '😀'.repeat(8), '👨‍👩‍👧‍👦', '\u00a0 一面中 \ufeff'])('accepts normalized Unicode text %s', text => {
    expect(environmentStampSchema.parse({ text, color: 'blue' }).text).toBe(text.trim())
  })
  it.each(['', '   ', '😀'.repeat(9), '一面\n中', '\n一面中', '一面\t中', 'x\u0000', 'x\u2028', '\ud800', '\udc00'])('rejects invalid text %s', text => {
    expect(environmentStampSchema.safeParse({ text, color: 'red' }).success).toBe(false)
  })
  it('strictly validates color, metadata, version and explicit clear', () => {
    for (const color of ['blue', 'amber', 'green', 'red']) expect(environmentStampSchema.safeParse({ text: '已挂', color }).success).toBe(true)
    expect(environmentStampSchema.safeParse({ text: 'x', color: 'purple' }).success).toBe(false)
    expect(environmentStampSchema.safeParse({ text: 'x', color: 'blue', html: '<p>' }).success).toBe(false)
    const valid = { id: 'environment', version: 1, stamp: null }
    expect(environmentStampInputSchema.parse(valid)).toEqual(valid)
    expect(environmentStampInputSchema.safeParse({ id: 'environment', version: 1 }).success).toBe(false)
    expect(environmentStampInputSchema.safeParse({ ...valid, version: 1.5 }).success).toBe(false)
    expect(environmentStampInputSchema.safeParse({ ...valid, version: 0 }).success).toBe(false)
    expect(environmentStampInputSchema.safeParse({ ...valid, accountId: 'other' }).success).toBe(false)
  })
})
