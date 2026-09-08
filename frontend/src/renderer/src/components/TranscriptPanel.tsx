import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUpRight, Ear, Microphone, Monitor, TextAlignLeft } from '@phosphor-icons/react'
import type { SessionController } from '../hooks/useSession'
import { formatTime } from '../hooks/sessionHelpers'
import RecordingControls from './RecordingControls'
import TranscriptSegmentEditor from './TranscriptSegmentEditor'
import AppendQuestionButton from './AppendQuestionButton'
import styles from '../styles/App.module.css'

interface TranscriptPanelProps { session: SessionController }
export default function TranscriptPanel({ session }: TranscriptPanelProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  function handleAppendSegment(id: string) {
    const added = session.appendSegmentToQuestion(id)
    if (added) follow.current = false
    return added
  }
  useEffect(() => {
    const element = viewport.current
    const activeElement = document.activeElement
    const editing = activeElement instanceof HTMLTextAreaElement && element?.contains(activeElement)
    if (follow.current && element && !editing && !session.questionAssembling) element.scrollTop = element.scrollHeight
  }, [session.record.segments, session.questionAssembling])
  return <section className={styles.transcriptPanel} aria-labelledby="transcript-title">
    <header className={styles.panelHeader}><div><TextAlignLeft size={18} weight="bold" /><h2 id="transcript-title">实时转写</h2></div><span className={styles.meta}>原声 · 文字</span></header>
    <RecordingControls session={session} />
    <div className={styles.transcriptScroll} ref={viewport} onScroll={event => {
      const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70
    }}>
      {session.record.segments.length ? <ol className={styles.transcriptList}>{session.record.segments.map((segment, index) => <li className={styles.transcriptSegment} key={segment.id}>
        <span className={styles.segmentTime}>{formatTime(segment.startMs)}</span>
        <div className={styles.segmentContent}>
          <TranscriptSegmentEditor segment={segment} index={index} onBegin={session.beginSegmentEdit} onChange={session.editSegment} onFinish={session.finishSegmentEdit} />
          <div className={styles.segmentActions}>{segment.isEdited && <span className={styles.segmentEdited}>已修改</span>}
          <AppendQuestionButton segmentId={segment.id} text={segment.text} disabled={!session.desktop} onAppend={handleAppendSegment} />
          <button type="button" className={styles.segmentAnswer} aria-label={`回答这句：${segment.text}`} disabled={!session.desktop || !segment.text.trim()}
            title={session.busy ? '停止当前生成，并回答这句话' : '针对这句话生成回答'}
            onMouseDown={event => { if (event.button === 0) event.preventDefault() }}
            onClick={event => {
              // Snapshot visible text before blur applies buffered ASR and can move this button.
              void session.answerSegment(segment.id)
              event.currentTarget.focus()
            }}>
            回答这句<ArrowUpRight size={14} weight="bold" aria-hidden="true" />
          </button>
          </div>
        </div>
      </li>)}</ol> : <div className={styles.transcriptEmpty}>
        <div className={styles.emptyIcon}><Ear size={30} weight="duotone" /></div>
        <h3>{session.status === 'listening' ? '正在听，请开始对话' : '对话从这里开始'}</h3>
        <p>选择音频来源并开始转写，<br />面试官的问题会实时显示在这里。</p>
        <div className={styles.audioHint}><Monitor size={16} />系统音频适合线上会议<br /><Microphone size={16} />麦克风适合练习与线下对话</div>
      </div>}
    </div>
    <footer className={styles.panelFooter} id="transcript-help"><span className={styles.subtleDot} /><span>点击文字直接修改，已修改的句子保留你的版本</span><ArrowDown size={14} /></footer>
  </section>
}
