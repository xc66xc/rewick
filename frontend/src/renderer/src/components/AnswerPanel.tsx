import { useCompactAnswerScroll } from '../hooks/useCompactAnswerScroll'
import { ArrowDown, ArrowUp, ChatTeardropText, Sparkle } from '@phosphor-icons/react'
import type { Settings } from '../../../shared/types'
import { answerModelLabel } from '../hooks/serviceChoices'
import type { SessionController } from '../hooks/useSession'
import AnswerCard from './AnswerCard'
import CompactTranscript from './CompactTranscript'
import SessionContextDetails from './SessionContextDetails'
import QuestionComposer, { type QuestionComposerController } from './QuestionComposer'
import { Button } from './ui/button'
import { EmptyState } from './ui/empty-state'
import { cn } from '../lib/cn'

interface AnswerPanelProps { session: QuestionComposerController & Pick<SessionController, 'record'>; settings: Settings; onSettings: () => void; onContext: () => void; compact?: boolean }
export default function AnswerPanel({ session, settings, compact = false }: AnswerPanelProps) {
  const segment = session.record.segments.at(-1)
  const hasTranscript = Boolean(segment?.text.trim())
  const { viewport, handleScroll, followLatest } = useCompactAnswerScroll(compact, session.record.answers, compact ? segment?.text : undefined, session.record.id)
  const answers = compact ? session.record.answers.slice().reverse() : session.record.answers
  const model = answerModelLabel(settings)
  function handleLatestAnswer() {
    if (compact) { followLatest(); return }
    const scroll = viewport.current
    const latest = scroll?.querySelectorAll<HTMLElement>(':scope > div > article').item(session.record.answers.length - 1)
    if (scroll && latest) scroll.scrollTop += latest.getBoundingClientRect().top - scroll.getBoundingClientRect().top
  }
  return <section className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-card max-[820px]:min-h-[540px]', compact && 'w-full rounded-none border-x-0 border-t-0 border-b-0 max-[820px]:min-h-0')} aria-label={compact ? '回答辅助' : undefined} aria-labelledby={compact ? undefined : 'answer-title'}>
    {!compact && <header className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b border-border px-5"><div className="flex items-center gap-2"><Sparkle size={18} aria-hidden="true" /><h2 id="answer-title" className="text-sm font-semibold">回答辅助</h2></div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {session.record.answers.length > 0 && <Button variant="quiet" size="xs" className="text-success hover:bg-success-subtle hover:text-success" onClick={handleLatestAnswer}><ArrowDown aria-hidden="true" />查看最新回答</Button>}
        {/* v30 answer-model(纯展示版):Sparkle + mono 模型名,完整显示不截断,不可点击 */}
        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-text-secondary"><Sparkle size={13} aria-hidden="true" className="shrink-0" /><span className="whitespace-nowrap font-mono text-[10.5px]">{model || '待配置模型'}</span></span>
      </div></header>}
    <div className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]" ref={viewport} onScroll={handleScroll} role="region" aria-label="回答与面试信息" tabIndex={0}>
      <div className="flow-root min-h-full">
      {!compact && <SessionContextDetails record={session.record} current={settings} />}
      {compact && <CompactTranscript recordId={session.record.id} segment={segment} answer={session.record.answers.at(-1)} />}
      {answers.length ? answers.map((answer, index) => <AnswerCard key={answer.id} answer={answer} index={compact ? answers.length - index : index + 1} compact={compact} />)
        : compact ? !hasTranscript && <div className="flex min-h-full flex-col justify-center gap-3 px-6 py-8 text-text-secondary"><h2 id="answer-title" className="text-lg font-semibold text-text-primary">准备好，听下一个问题。</h2><p className="text-sm leading-relaxed">开始转写，或在下方输入问题。<br />生成后，回答会显示在这里。</p></div> : <div className="flex min-h-full flex-col"><EmptyState className="m-auto" tone="success" icon={<ChatTeardropText weight="duotone" />}
          title="下一句，用你的话回答。" description="结合当前问题与你的真实经历，生成可以直接说出口的口语回答。" />
        </div>}
      </div>
    </div>
    {compact && (session.record.answers.length > 0 || hasTranscript) && <div className="compact-chat__latest flex shrink-0 justify-end"><Button variant="quiet" size="sm" className="text-xs" onClick={handleLatestAnswer} aria-label="查看最新回答"><ArrowUp aria-hidden="true" />最新回答</Button></div>}
    <QuestionComposer session={session} compact={compact} />
  </section>
}
