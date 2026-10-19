import { lazy, Suspense, useState, type RefObject } from 'react'
import { CheckCircle, DotsThree, PauseCircle, Waveform } from '@phosphor-icons/react'
import type { MockSession } from '../../../../shared/mock-interview'
import { Pill, Dot } from '../../components/ui/pill'
import Avatar2D from './Avatar2D'
import AvatarRenderBoundary from './AvatarRenderBoundary'
import { Segmented } from '../../components/ui/segmented'
const Avatar3D = lazy(() => import('./Avatar3D'))

interface AvatarStageProps { state?: MockSession['state']; level: number; audioLevel?: RefObject<number>; connected?: boolean }
const labels = { ready: '准备就绪', starting: '正在准备问题', speaking: '面试官讲话中', listening: '正在听你回答', deciding: '正在思考追问', paused: '已暂停', completed: '面试结束', error: '需要处理异常' }
const hints = { ready: '准备好后，我们就开始', starting: '马上开始，请稍候', speaking: '听完问题，再自然作答', listening: '保持自然表达', deciding: '正在整理你的回答', paused: '准备好后，继续面试', completed: '本场问答已保存', error: '检查连接后再继续' }
export default function AvatarStage({ state = 'ready', level, audioLevel, connected = false }: AvatarStageProps) {
  const [mode, setMode] = useState('3d')
  const Icon = state === 'paused' ? PauseCircle : state === 'completed' ? CheckCircle : ['starting', 'deciding'].includes(state) ? DotsThree : Waveform
  const online = connected && !['completed', 'error'].includes(state)
  const connectionLabel = state === 'completed' ? '已结束' : state === 'error' ? '连接异常' : online ? '在线' : '未连接'
  return <section className="mock-interviewer self-start overflow-hidden rounded-card border border-border bg-card" aria-label="卡通面试官" data-state={state}>
    <div className="mock-interviewer__portrait" role="group" aria-label={`面试官，${labels[state]}`}>
      <AvatarRenderBoundary key={mode}>{mode === '2d' ? <Avatar2D state={state} level={level} audioLevel={audioLevel} /> : <Suspense fallback={<p className="mock-interviewer__loading" role="status">正在加载 3D 引擎…</p>}><Avatar3D state={state} level={level} audioLevel={audioLevel} /></Suspense>}</AvatarRenderBoundary>
      <header className="mock-interviewer__header">
        <Pill className="rounded-full border-transparent bg-card/95 px-3 py-0.5 text-xs font-medium leading-5">Rewick 面试官</Pill>
        <Pill className="rounded-full border-transparent bg-card/95 px-3 py-0.5 text-xs leading-5 text-text-secondary"><Dot tone={online ? 'success' : state === 'error' ? 'danger' : 'muted'} pulse={false} />{connectionLabel}</Pill>
      </header>
    </div>
    <footer className="mock-interviewer__footer">
      <Icon className="mock-interviewer__signal shrink-0 text-accent" size={32} weight="regular" aria-hidden="true" />
      <div className="min-w-0"><h2 className="text-sm font-semibold leading-5" role="status">{labels[state]}</h2><p className="mt-1 text-xs text-text-secondary">{hints[state]}</p>{mode === '3d' && <p className="mt-1 text-xs text-text-secondary">当前模型未绑定嘴型和眨眼</p>}</div>
    </footer>
    <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
      <span className="text-xs text-text-secondary">{mode === '3d' ? '3D 角色 · 轻微动态' : '2D 卡通角色'}</span>
      <Segmented value={mode} onValueChange={setMode} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]} aria-label="面试官显示方式" />
    </div>
  </section>
}
