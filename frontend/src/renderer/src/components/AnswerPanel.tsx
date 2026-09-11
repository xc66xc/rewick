import { useRef } from 'react'
import { ArrowDown, ChatTeardropText, Sparkle } from '@phosphor-icons/react'
import type { Settings } from '../../../shared/types'
import { answerModelLabel } from '../hooks/serviceChoices'
import type { SessionController } from '../hooks/useSession'
import AnswerCard from './AnswerCard'
import SessionContextDetails from './SessionContextDetails'
import QuestionComposer, { type QuestionComposerController } from './QuestionComposer'
import { Button } from './ui/button'
import { EmptyState } from './ui/empty-state'
import { cn } from '../lib/cn'

interface AnswerPanelProps { session: QuestionComposerController & Pick<SessionController, 'record'>; settings: Settings; onSettings: () => void; onContext: () => void; compact?: boolean }
export default function AnswerPanel({ session, settings, compact = false }: AnswerPanelProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const model = answerModelLabel(settings)
  function handleLatestAnswer() {
    const scroll = viewport.current
    const latest = scroll?.querySelectorAll<HTMLElement>(':scope > article').item(session.record.answers.length - 1)
    if (scroll && latest) scroll.scrollTop += latest.getBoundingClientRect().top - scroll.getBoundingClientRect().top
  }
  return <section className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-card max-[820px]:min-h-[540px]', compact && 'w-full rounded-none border-x-0 border-t-0 border-b-0 max-[820px]:min-h-0')} aria-labelledby="answer-title">
    <header className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b border-border px-5"><div className="flex items-center gap-2"><Sparkle size={18} aria-hidden="true" /><h2 id="answer-title" className="text-sm font-semibold">回答辅助</h2></div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {session.record.answers.length > 0 && <Button variant="quiet" size="xs" className="text-success hover:bg-success-subtle hover:text-success" onClick={handleLatestAnswer}><ArrowDown aria-hidden="true" />查看最新回答</Button>}
        {/* v30 answer-model(纯展示版):Sparkle + mono 模型名,完整显示不截断,不可点击 */}
        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-text-secondary"><Sparkle size={13} aria-hidden="true" className="shrink-0" /><span className="whitespace-nowrap font-mono text-[10.5px]">{model || '待配置模型'}</span></span>
      </div></header>
    <div className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]" ref={viewport} role="region" aria-label="回答与面试信息" tabIndex={0}>
      <SessionContextDetails record={session.record} current={settings} />
      {session.record.answers.length ? session.record.answers.map((answer, index) => <AnswerCard key={answer.id} answer={answer} index={index + 1} />)
        : <div className="flex min-h-full flex-col"><EmptyState className="m-auto" tone="success" icon={<ChatTeardropText weight="duotone" />}
          title="下一句，用你的话回答。" description="结合当前问题与你的真实经历，生成可以直接说出口的口语回答。" />
        </div>}
    </div>
    <QuestionComposer session={session} />
  </section>
}
