import { useEffect, useRef, type RefObject } from 'react'
import type { MockSession } from '../../../../shared/mock-interview'

const positions = ['translate(0, 0)', 'translate(-50%, 0)', 'translate(0, -50%)', 'translate(-50%, -50%)']
function mouthFrame(level: number) { return level > 0.5 ? 2 : level > 0.08 ? 1 : 0 }

/** One local atlas; only update the compositor when the audio-driven frame changes. */
export function useAvatarFrame(state: MockSession['state'], level: number, audioLevel?: RefObject<number>) {
  const image = useRef<HTMLImageElement>(null)
  const initial = state === 'speaking' ? mouthFrame(level) : 0
  useEffect(() => {
    let animation = 0, lastTick = 0, lastFrame = -1
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const active = !['ready', 'paused', 'completed', 'error'].includes(state)
    const paint = (frame: number) => {
      if (frame === lastFrame || !image.current) return
      lastFrame = frame
      image.current.style.transform = positions[frame]
      image.current.dataset.frame = String(frame)
    }
    const draw = (time: number) => {
      if (document.hidden || motion.matches || !active) { paint(0); return }
      if (time - lastTick >= 50) {
        lastTick = time
        const mouth = state === 'speaking' ? mouthFrame(audioLevel?.current ?? level) : 0
        const blink = time % 5200 > 5000
        paint(mouth || (blink ? 3 : 0))
      }
      animation = requestAnimationFrame(draw)
    }
    const restart = () => { cancelAnimationFrame(animation); lastTick = 0; draw(performance.now()) }
    document.addEventListener('visibilitychange', restart)
    motion.addEventListener('change', restart)
    restart()
    return () => { cancelAnimationFrame(animation); document.removeEventListener('visibilitychange', restart); motion.removeEventListener('change', restart) }
  }, [state, level, audioLevel])
  return { image, initial, position: positions[initial] }
}
