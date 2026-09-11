import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge, ReferenceDocument } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import { Modal } from './ui/dialog'
import { formNoteClass, inlineErrorClass } from '../lib/form'

interface ReferencePreviewDialogProps { document: ReferenceDocument; bridge: DesktopBridge; onClose: () => void }
export default function ReferencePreviewDialog({ document, bridge, onClose }: ReferencePreviewDialogProps) {
  const returnFocus = useRef(window.document.activeElement)
  const [preview, setPreview] = useState<{ document: ReferenceDocument; text: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const previouslyFocused = returnFocus.current
    return () => {
      // 条件渲染的 Modal 无 Trigger 关联，Base UI 不会自动返还焦点，手动还给打开者。
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus()
    }
  }, [])
  useEffect(() => {
    let active = true
    setPreview(null); setError('')
    bridge.previewReference(document.id).then(value => { if (active) setPreview(value) }).catch(reason => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [bridge, document.id])
  return <Modal open onOpenChange={nextOpen => { if (!nextOpen) onClose() }} width="lg"
    title={<><span className="block text-xs font-medium text-text-secondary">提取文字预览</span><span className="block [overflow-wrap:anywhere]">{document.name}</span></>}>
    {error ? <p className={inlineErrorClass} role="alert">{error}</p> : preview ? <>
      <p className={formNoteClass}>{preview.document.kind === 'personal' ? '我的项目经历' : '技术参考'} · {preview.document.pageCount} 页 · 版本 {preview.document.revision}</p>
      <pre className="mt-3 max-h-[50dvh] overflow-auto font-sans text-xs leading-[1.9] whitespace-pre-wrap [overflow-wrap:anywhere]">{preview.text || '这份资料尚无可预览文字。'}</pre></> : <p className={formNoteClass} role="status">正在读取资料…</p>}
  </Modal>
}
