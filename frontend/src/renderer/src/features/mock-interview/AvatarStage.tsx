import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MockSession } from '../../../../shared/mock-interview'
interface AvatarStageProps { state?: MockSession['state']; level: number; audioLevel?: RefObject<number> }
const labels = { ready: '准备就绪', starting: '正在准备问题', speaking: '面试官讲话中', listening: '正在听你回答', deciding: '正在思考追问', paused: '已暂停', completed: '面试结束', error: '需要处理异常' }
export default function AvatarStage({ state = 'ready', level, audioLevel }: AvatarStageProps) {
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => { const changed = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', changed); return () => document.removeEventListener('visibilitychange', changed) }, [])
  const animate = visible && !['paused', 'completed', 'error'].includes(state)
  const openMouth = useRef<SVGEllipseElement>(null)
  const closedMouth = useRef<SVGPathElement>(null)
  useEffect(() => {
    if (!audioLevel) return
    let frame = 0, last = 0
    const draw = (time: number) => {
      if (time - last >= 50) {
        last = time
        const value = state === 'speaking' && !document.hidden ? Math.round(Math.min(1, audioLevel.current) * 3) : 0
        openMouth.current?.setAttribute('rx', String(12 + value * 2)); openMouth.current?.setAttribute('ry', String(3 + value * 4))
        openMouth.current?.setAttribute('visibility', value ? 'visible' : 'hidden'); closedMouth.current?.setAttribute('visibility', value ? 'hidden' : 'visible')
      }
      if (!document.hidden) frame = requestAnimationFrame(draw)
    }
    const visibility = () => { cancelAnimationFrame(frame); last = 0; draw(performance.now()) }
    document.addEventListener('visibilitychange', visibility); draw(performance.now())
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility) }
  }, [audioLevel, state])
  const mouth = state === 'speaking' ? Math.round(Math.min(1, level) * 3) : 0
  return <section className="flex flex-col items-center justify-center rounded-card bg-accent-subtle p-6" aria-label="卡通面试官">
    <svg viewBox="0 0 320 320" className={`w-full max-h-[340px] text-accent ${animate ? 'mock-avatar--alive' : ''}`} role="img" aria-label={`面试官，${labels[state]}`}>
      <ellipse cx="160" cy="300" rx="100" ry="10" className="fill-accent-line" />
      <path d="M62 294v-39c0-46 40-68 98-68s98 22 98 68v39z" className="fill-accent" />
      <path d="m134 198 26 34 26-34v-28h-52z" className="fill-card" />
      <rect x="89" y="62" width="142" height="143" rx="64" className="fill-card stroke-border-strong" strokeWidth="3" />
      <path d="M88 124C65 54 108 26 156 30c67-12 94 31 78 95l-20-44c-51 15-73-4-87-18l-18 64z" className="fill-text-primary" />
      <path d="m111 124 27-3m45 0 27 3" className="stroke-text-primary" strokeWidth="5" strokeLinecap="round" />
      <g className="mock-avatar__eyes"><circle cx="125" cy="141" r="5" className="fill-text-primary" /><circle cx="195" cy="141" r="5" className="fill-text-primary" /></g>
      <path d="m157 148-4 14h10" className="stroke-text-secondary" fill="none" strokeWidth="3" strokeLinecap="round" />
      <path ref={closedMouth} visibility={mouth ? 'hidden' : 'visible'} d="M143 178q17 13 34 0" fill="none" className="stroke-text-primary" strokeWidth="4" strokeLinecap="round" /><ellipse ref={openMouth} visibility={mouth ? 'visible' : 'hidden'} cx="160" cy="179" rx={12 + mouth * 2} ry={3 + mouth * 4} className="fill-text-primary" />
      <path d="m120 216 40 50 40-50" className="stroke-accent-line" strokeWidth="3" fill="none" />
      <circle cx="160" cy="280" r="3" className="fill-card" />
    </svg>
    <h2 className="mt-3 text-lg font-semibold">Rewick 面试官</h2><p className="mt-2 text-sm text-text-secondary" role="status">{labels[state]}</p>
  </section>
}
