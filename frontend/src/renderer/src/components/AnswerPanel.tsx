import { useRef } from 'react'
import { ArrowDown, ArrowUpRight, ChatTeardropText, FileText, Sparkle } from '@phosphor-icons/react'
import type { Settings } from '../../../shared/types'
import { selectedPlatformModel } from '../../../shared/platform-models'
import type { SessionController } from '../hooks/useSession'
import { isAnswerModelReady, usesPlatformAnswer } from '../hooks/useAutoAnswer'
import AnswerCard from './AnswerCard'
import SessionContextDetails from './SessionContextDetails'
import QuestionComposer, { type QuestionComposerController } from './QuestionComposer'
import styles from '../styles/App.module.css'

interface AnswerPanelProps { session: QuestionComposerController & Pick<SessionController, 'record'>; settings: Settings; onSettings: () => void; onContext: () => void; compact?: boolean }
export default function AnswerPanel({ session, settings, onSettings, onContext, compact = false }: AnswerPanelProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const model = usesPlatformAnswer(settings) ? selectedPlatformModel(settings.platform)?.name ?? '请重选平台模型' : settings.llm.model
  function handleLatestAnswer() {
    const scroll = viewport.current
    const latest = scroll?.querySelectorAll<HTMLElement>(':scope > article').item(session.record.answers.length - 1)
    if (scroll && latest) scroll.scrollTop += latest.getBoundingClientRect().top - scroll.getBoundingClientRect().top
  }
  return <section className={`${styles.answerPanel} ${compact ? styles.answerPanelCompact : ''}`} aria-labelledby="answer-title">
    <header className={styles.panelHeader}><div><Sparkle size={18} weight="bold" /><h2 id="answer-title">回答辅助</h2></div>
      <div className={styles.answerHeaderActions}>
        {session.record.answers.length > 0 && <button type="button" className={styles.latestAnswerButton} onClick={handleLatestAnswer}><ArrowDown size={13} aria-hidden="true" />查看最新回答</button>}
        <span className={styles.modelBadge}>{model || '待配置模型'}</span>
      </div></header>
    <div className={styles.answerScroll} ref={viewport} role="region" aria-label="回答与面试信息" tabIndex={0}>
      <SessionContextDetails record={session.record} current={settings} />
      {session.record.answers.length ? session.record.answers.map((answer, index) => <AnswerCard key={answer.id} answer={answer} index={index + 1} />)
        : <div className={styles.answerEmpty}>
          <div className={styles.answerEmptySymbol}><ChatTeardropText size={36} weight="duotone" /><span className={styles.symbolCorner}><Sparkle size={18} weight="fill" /></span></div>
          <h3>下一句，用你的话回答。</h3>
          <p>结合当前问题与你的真实经历，生成可以直接说出口的口语回答。</p>
          <div className={styles.setupSteps}>
            <button onClick={onSettings}><span className={styles.stepNumber}>01</span><div><strong>{isAnswerModelReady(settings) ? '回答模型已配置' : '连接你的模型'}</strong><span>支持平台服务与自带模型</span></div><ArrowUpRight size={18} /></button>
            <button onClick={onContext}><span className={styles.stepNumber}>02</span><div><strong>{settings.context.text ? '个人背景已就绪' : '添加个人背景'}</strong><span>让回答贴合你的真实经历</span></div><FileText size={18} /></button>
          </div>
        </div>}
    </div>
    <QuestionComposer session={session} />
  </section>
}
