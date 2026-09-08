import { useEffect, useRef, useState } from 'react'
import type { SessionRecord } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import styles from '../styles/App.module.css'
import historyStyles from '../styles/HistoryManagement.module.css'

interface DeleteSessionDialogProps {
  record: SessionRecord; isCurrent: boolean; locked: boolean
  onDelete: (id: string) => Promise<void>; onClose: () => void; onDeleted: () => void
}

export default function DeleteSessionDialog({ record, isCurrent, locked, onDelete, onClose, onDeleted }: DeleteSessionDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef(document.activeElement)
  const inFlight = useRef(false)
  const deleted = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    const previouslyFocused = returnFocus.current
    element?.showModal()
    return () => {
      element?.close()
      if (!deleted.current && previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus()
    }
  }, []) // Native dialog traps focus for this confirmation's mounted lifetime.
  async function handleDelete() {
    if (inFlight.current || locked) return
    inFlight.current = true; setBusy(true); setError('')
    try { await onDelete(record.id); deleted.current = true; onDeleted() }
    catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className={`${styles.settingsDialog} ${historyStyles.dialog}`} aria-labelledby="delete-session-title" aria-describedby="delete-session-record delete-session-description" aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose() }}>
    <header className={styles.dialogHeader}><h2 id="delete-session-title">删除会话记录</h2></header>
    <div className={styles.dialogBody}>
      <p id="delete-session-record" className={historyStyles.recordTitle}>「{record.title}」</p>
      <p id="delete-session-description">将删除这场会话的全部转写、回答和本次发送内容，无法撤销。</p>
      {isCurrent && <p className={historyStyles.currentWarning}>这是当前会话，删除后会清空工作台并开始新会话。</p>}
      {locked && <p className={historyStyles.currentWarning} role="status">请先停止当前会话的转写或回答，再删除记录。</p>}
      {error && <p className={styles.inlineError} role="alert">删除失败：{error}</p>}
    </div>
    <footer className={styles.dialogFooter}>
      <button type="button" className={styles.secondaryButton} autoFocus disabled={busy} onClick={() => { if (!inFlight.current) onClose() }}>取消</button>
      <button type="button" className={historyStyles.confirmButton} disabled={busy || locked} onClick={() => void handleDelete()}>{busy ? '删除中…' : '确认删除'}</button>
    </footer>
  </dialog>
}
