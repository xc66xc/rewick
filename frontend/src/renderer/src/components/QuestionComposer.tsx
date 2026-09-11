import { useRef } from 'react'
import { ArrowElbowDownLeft, ArrowUp, Stop } from '@phosphor-icons/react'
import type { SessionController } from '../hooks/useSession'
import { useQuestionComposerHeight } from '../hooks/useQuestionComposerHeight'
import { Button, buttonDangerClass } from './ui/button'
import { Kbd } from './ui/kbd'
import { cn } from '../lib/cn'

export type QuestionComposerController = Pick<SessionController, 'question' | 'questionAssembling' | 'setQuestion' | 'generate' | 'busy' | 'cancel' | 'desktop'>
interface QuestionComposerProps { session: QuestionComposerController }
export default function QuestionComposer({ session }: QuestionComposerProps) {
  const input = useRef<HTMLTextAreaElement>(null)
  useQuestionComposerHeight(input, session.question, session.questionAssembling)
  /* v30 composer:focus-within 高亮容器 + 无边框输入区 + 底部提示行(快捷键入按钮);
     合并状态行按 v30 .assembly 置于输入区上方,仅进行中显示 */
  return <div className="mx-4 mt-2 mb-3 shrink-0 rounded-control border border-border-strong bg-card px-3.5 pb-2.5 pt-3 transition-[border-color,box-shadow] duration-150 ease-standard focus-within:border-accent focus-within:shadow-focus-ring">
    {session.questionAssembling && <div className="mb-2 flex items-center justify-between gap-2 text-[11.5px] text-text-secondary"><span id="question-assembly-status" role="status">正在合并问题</span><button type="button" className="rounded-[4px] px-1 py-0.5 text-[11px] text-accent-text underline underline-offset-2 transition-colors hover:bg-accent-subtle" aria-label="清空当前问题" onClick={() => session.setQuestion('')}>清空</button></div>}
    <textarea ref={input} id="question" aria-label="当前问题" value={session.question} onChange={event => session.setQuestion(event.target.value)} maxLength={12000} rows={1}
      aria-describedby={session.questionAssembling ? 'question-assembly-status' : undefined}
      placeholder="输入面试问题，或从实时对话中获取…" onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === 'Enter') { event.preventDefault(); void session.generate() }
      }}
      className={cn('block min-h-[42px] w-full resize-y border-0 bg-transparent px-0 py-0.5 text-[12.5px] leading-[22px] outline-none placeholder:text-text-muted',
        session.questionAssembling && 'resize-none overflow-y-auto')} />
    <div className="mt-1.5 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[10px] text-text-secondary"><ArrowElbowDownLeft size={13} aria-hidden="true" />留空时使用最近的转写内容</span>
      {session.busy ? <Button size="sm" className={buttonDangerClass} onClick={() => void session.cancel()}><Stop aria-hidden="true" />停止生成</Button>
        : <Button variant="primary" size="sm" onClick={() => void session.generate()} disabled={!session.desktop}>生成回答<ArrowUp aria-hidden="true" /><Kbd>⌘ ↵</Kbd></Button>}
    </div>
  </div>
}
