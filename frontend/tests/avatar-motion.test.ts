import { describe, expect, it } from 'vitest'
import { canAnimateAvatar, mouthTarget } from '../src/renderer/src/features/mock-interview/avatarMotion'

describe('3D interviewer movement policy', () => {
  it('closes the mouth when not speaking, including when microphone audio is loud', () => {
    for (const state of ['ready', 'listening', 'paused', 'completed', 'error'] as const) expect(mouthTarget(state, 1)).toBe(0)
    expect(mouthTarget('speaking', 0.7)).toBe(0.7)
    expect(mouthTarget('speaking', NaN)).toBe(0)
    expect(mouthTarget('speaking', 9)).toBe(1)
  })
  it('stops continuous animation when hidden, paused, finished, or reduced motion is enabled', () => {
    expect(canAnimateAvatar('speaking', false, false)).toBe(true)
    expect(canAnimateAvatar('listening', true, false)).toBe(false)
    expect(canAnimateAvatar('speaking', false, true)).toBe(false)
    for (const state of ['ready', 'paused', 'completed', 'error'] as const) expect(canAnimateAvatar(state, false, false)).toBe(false)
  })
})
