import { useEffect } from 'react'
import type { Group } from 'three'
import type { MockSession } from '../../../../shared/mock-interview'

/** Transform only the outer group: imported skeletal clips are never played. */
export function useAvatarSway(root: Group | undefined, height: number, state: MockSession['state'], invalidate: () => void) {
  useEffect(() => {
    if (!root) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const active = !['ready', 'paused', 'completed', 'error'].includes(state)
    let animation = 0, lastTick = 0, started = performance.now()
    const reset = () => {
      root.position.set(0, 0, 0)
      root.rotation.set(0, 0, 0)
      root.scale.set(1, 1, 1)
      invalidate()
    }
    const draw = (now: number) => {
      if (document.hidden || motion.matches || !active) { reset(); return }
      if (now - lastTick >= 42) {
        lastTick = now
        const seconds = (now - started) / 1000
        const breath = Math.sin(seconds * Math.PI * 2 / 4.8)
        root.scale.y = 1 + breath * 0.002
        root.position.y = breath * height * 0.001
        root.rotation.y = Math.sin(seconds * Math.PI * 2 / 9) * 0.018
        root.rotation.z = Math.sin(seconds * Math.PI * 2 / 7) * 0.004
        invalidate()
      }
      animation = requestAnimationFrame(draw)
    }
    const restart = () => {
      cancelAnimationFrame(animation)
      started = performance.now()
      lastTick = 0
      reset()
      if (!document.hidden && !motion.matches && active) animation = requestAnimationFrame(draw)
    }
    document.addEventListener('visibilitychange', restart)
    motion.addEventListener('change', restart)
    restart()
    return () => {
      cancelAnimationFrame(animation)
      document.removeEventListener('visibilitychange', restart)
      motion.removeEventListener('change', restart)
      reset()
    }
  }, [root, height, state, invalidate])
}
