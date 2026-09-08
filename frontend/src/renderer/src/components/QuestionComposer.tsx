import { useRef } from 'react'
import { ArrowUpRight, Stop } from '@phosphor-icons/react'
import type { SessionController } from '../hooks/useSession'
import { useQuestionComposerHeight } from '../hooks/useQuestionComposerHeight'
import styles from '../styles/App.module.css'

export type QuestionComposerController = Pick<SessionController, 'question' | 'questionAssembling' | 'setQuestion' | 'generate' | 'busy' | 'cancel' | 'desktop'>
interface QuestionComposerProps { session: QuestionComposerController }
export default function QuestionComposer({ session }: QuestionComposerProps) {
  const input = useRef<HTMLTextAreaElement>(null)
  useQuestionComposerHeight(input, session.question, session.questionAssembling)
  return <div className={styles.composer}>
    <div className={styles.composerLabel}><label htmlFor="question">当前问题</label><div className={styles.composerHint}>
      {session.questionAssembling ? <><span id="question-assembly-status" role="status">正在合并问题</span><button type="button" className={styles.composerClear} aria-label="清空当前问题" onClick={() => session.setQuestion('')}>清空</button></>
        : <span className={styles.composerPlaceholderHint}>留空时使用最近的转写内容</span>}
    </div></div>
    <textarea ref={input} id="question" className={`${styles.composerInput} ${session.questionAssembling ? styles.composerInputAssembling : ''}`} value={session.question} onChange={event => session.setQuestion(event.target.value)} maxLength={12000} rows={1}
      aria-describedby={session.questionAssembling ? 'question-assembly-status' : undefined}
      placeholder="输入面试问题，或从实时对话中获取…" onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === 'Enter') { event.preventDefault(); void session.generate() }
      }} />
    <div className={styles.composerFooter}><span className={styles.shortcut}><kbd>⌘</kbd><kbd>⇧</kbd><kbd>↵</kbd><span>随时生成</span></span>
      {session.busy ? <button className={styles.secondaryButton} onClick={() => void session.cancel()}><Stop size={14} weight="fill" />停止生成</button>
        : <button className={styles.primaryButton} onClick={() => void session.generate()} disabled={!session.desktop}>生成回答<ArrowUpRight size={16} weight="bold" /></button>}
    </div>
  </div>
}
