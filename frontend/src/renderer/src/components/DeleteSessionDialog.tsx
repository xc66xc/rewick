import { useEffect, useRef, useState } from 'react'
import type { SessionRecord } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import { Modal } from './ui/dialog'
import { Button } from './ui/button'

interface DeleteSessionDialogProps {
  record: SessionRecord; isCurrent: boolean; locked: boolean
  onDelete: (id: string) => Promise<void>; onClose: () => void; onDeleted: () => void
}
export default function DeleteSessionDialog({ record, isCurrent, locked, onDelete, onClose, onDeleted }: DeleteSessionDialogProps) {
  const inFlight = useRef(false)
  const returnFocus = useRef(document.activeElement)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const previouslyFocused = returnFocus.current
    return () => {
      // 条件渲染的 Modal 无 Trigger 关联，Base UI 不会自动返还焦点，手动还给打开者。
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus()
    }
  }, [])
  function requestClose() { if (!inFlight.current) onClose() }
  async function handleDelete() {
    if (inFlight.current || locked) return
    inFlight.current = true; setBusy(true); setError('')
    try { await onDelete(record.id); onDeleted() }
    catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Modal open onOpenChange={nextOpen => { if (!nextOpen) requestClose() }} title="删除会话记录"
    footer={<>
      <Button autoFocus disabled={busy} onClick={requestClose}>取消</Button>
      <Button variant="primary" className="border-danger bg-danger hover:bg-danger/90 active:bg-danger" disabled={busy || locked} onClick={() => void handleDelete()}>{busy ? '删除中…' : '确认删除'}</Button>
    </>}>
    <div aria-busy={busy}>
      <p className="mb-3 font-semibold text-accent-text [overflow-wrap:anywhere]">「{record.title}」</p>
      <p className="text-[13px] leading-[1.9] text-text-secondary">将删除这场会话的全部转写、回答和本次发送内容，无法撤销。</p>
      {isCurrent && <p className="mt-3 text-[13px] text-text-secondary">这是当前会话，删除后会清空工作台并开始新会话。</p>}
      {locked && <p className="mt-3 text-[13px] text-text-secondary" role="status">请先停止当前会话的转写或回答，再删除记录。</p>}
      {error && <p className="mt-3 text-[13px] text-danger" role="alert">删除失败：{error}</p>}
    </div>
  </Modal>
}
