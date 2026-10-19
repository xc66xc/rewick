import { describe, expect, it } from 'vitest'
import { avatarDistance } from '../src/renderer/src/features/mock-interview/avatarFraming'

describe('static GLB framing', () => {
  it('keeps the full model visible in wide and portrait panels', () => {
    const size = { x: 1.4, y: 1.9, z: 1.2 }
    for (const aspect of [0.5, 0.75, 1.5]) {
      const distance = avatarDistance(size, aspect, 32)
      const visibleHeight = 2 * (distance - size.z / 2) * Math.tan(32 * Math.PI / 360)
      expect(visibleHeight).toBeGreaterThan(size.y)
      expect(visibleHeight * aspect).toBeGreaterThan(size.x)
    }
    expect(avatarDistance(size, .5, 32)).toBeGreaterThan(avatarDistance(size, 1.5, 32))
  })
  it('rejects invalid model bounds or an unmeasured viewport', () => {
    expect(() => avatarDistance({ x: 0, y: 0, z: 0 }, 1, 32)).toThrow()
    expect(() => avatarDistance({ x: Infinity, y: 2, z: 1 }, 1, 32)).toThrow()
    expect(() => avatarDistance({ x: 1, y: 2, z: 1 }, 0, 32)).toThrow()
  })
})
