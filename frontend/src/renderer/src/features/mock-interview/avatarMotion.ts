import type { MockSession } from '../../../../shared/mock-interview'

export const AVATAR_FRAME_MS = Math.ceil(1000 / 24)
export function canAnimateAvatar(state: MockSession['state'], hidden: boolean, reduced: boolean) {
  return !hidden && !reduced && ['starting', 'speaking', 'listening', 'deciding'].includes(state)
}
export function mouthTarget(state: MockSession['state'], level: number) {
  return state === 'speaking' && Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0
}
