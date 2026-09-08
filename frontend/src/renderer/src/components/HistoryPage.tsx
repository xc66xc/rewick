import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ClockCounterClockwise, DownloadSimple, TextAlignLeft, Trash } from '@phosphor-icons/react'
import type { SessionRecord } from '../../../shared/types'
import AnswerCard from './AnswerCard'
import SessionContextDetails from './SessionContextDetails'
import DeleteSessionDialog from './DeleteSessionDialog'
import styles from '../styles/App.module.css'
import historyStyles from '../styles/HistoryManagement.module.css'

interface HistoryPageProps {
  records: SessionRecord[]; activeSessionId: string; activeSessionLocked: boolean
  onExport: (record: SessionRecord) => Promise<void>; onDelete: (id: string) => Promise<void>
}
function formatDate(value: string) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
export default function HistoryPage({ records, activeSessionId, activeSessionLocked, onExport, onDelete }: HistoryPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SessionRecord | null>(null)
  const [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const selected = records.find(record => record.id === selectedId)
  useEffect(() => { if (notice) heading.current?.focus() }, [notice])
  function handleDeleted() {
    if (!pendingDelete) return
    setSelectedId(null); setPendingDelete(null); setNotice(`已删除「${pendingDelete.title}」。`)
  }
  function handleDeleteRequest(record: SessionRecord) { setNotice(''); setPendingDelete(record) }
  function locked(id: string) { return activeSessionLocked && id === activeSessionId }
  const lockedHint = '请先停止当前会话的转写或回答，再删除记录。'
  return <section className={styles.historyPage} aria-labelledby="history-title">
    <header className={styles.pageHeading}><div><span className={styles.eyebrow}>回看每一次表达</span><h1 ref={heading} id="history-title" tabIndex={-1}>会话记录</h1><p>保存在本机，随时回顾或导出。</p></div><span className={styles.historyCount}>{records.length} 场会话</span></header>
    {notice && <p className={historyStyles.notice} role="status">{notice}</p>}
    {selected ? <div className={styles.historyDetail}><div className={styles.historyDetailHeader}><button className={styles.textButton} onClick={() => setSelectedId(null)}><ArrowLeft size={17} />返回记录</button>
      <div className={historyStyles.actions}><button className={styles.secondaryButton} onClick={() => void onExport(selected)}><DownloadSimple size={17} weight="bold" />导出 Markdown</button>
        <button type="button" className={historyStyles.deleteButton} disabled={locked(selected.id)} title={locked(selected.id) ? lockedHint : undefined} onClick={() => handleDeleteRequest(selected)}><Trash size={16} aria-hidden="true" />删除会话</button></div></div>
      <h2>{selected.title}</h2><p className={styles.meta}>{formatDate(selected.createdAt)} · {selected.answers.length} 个回答</p>
      <SessionContextDetails record={selected} />
      {selected.segments.length > 0 && <details className={styles.historyTranscript}><summary><TextAlignLeft size={17} />查看转写全文</summary><div>{selected.segments.map(segment => <p key={segment.id}>{segment.text}</p>)}</div></details>}
      {selected.answers.map((answer, index) => <AnswerCard key={answer.id} answer={answer.status === 'streaming' && selected.id !== activeSessionId ? { ...answer, status: 'cancelled' } : answer} index={index + 1} />)}</div>
      : records.length ? <div className={styles.historyList}>{records.map(record => <div key={record.id} className={styles.historyItem}>
        <button type="button" className={historyStyles.openButton} onClick={() => { setNotice(''); setSelectedId(record.id) }}>
          <div className={styles.historyItemIcon}><ClockCounterClockwise size={22} weight="bold" /></div><div className={historyStyles.identity}><h2>{record.title}</h2><p>{formatDate(record.createdAt)}<span>·</span>{record.segments.length} 段转写<span>·</span>{record.answers.length} 个回答</p>{record.interviewEnvironment && <p>面试环境：{record.interviewEnvironment.name}</p>}</div><ArrowLeft className={styles.historyArrow} size={19} /></button>
        <button type="button" className={historyStyles.deleteButton} aria-label={`删除会话：${record.title}`} disabled={locked(record.id)} title={locked(record.id) ? lockedHint : '删除会话'} onClick={() => handleDeleteRequest(record)}><Trash size={16} aria-hidden="true" />删除</button>
      </div>)}</div>
        : <div className={styles.historyEmpty}><ClockCounterClockwise size={42} weight="duotone" /><h2>你的第一场会话，即将开始</h2><p>结束转写或完成回答后，会话会自动保存在这里。</p></div>}
    {pendingDelete && <DeleteSessionDialog record={pendingDelete} isCurrent={pendingDelete.id === activeSessionId} locked={locked(pendingDelete.id)} onDelete={onDelete} onClose={() => setPendingDelete(null)} onDeleted={handleDeleted} />}
  </section>
}
