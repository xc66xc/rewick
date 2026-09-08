import { useEffect, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { DesktopBridge, ReferenceDocument } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import IconButton from './IconButton'
import styles from '../styles/App.module.css'

interface ReferencePreviewDialogProps { document: ReferenceDocument; bridge: DesktopBridge; onClose: () => void }
export default function ReferencePreviewDialog({ document, bridge, onClose }: ReferencePreviewDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [preview, setPreview] = useState<{ document: ReferenceDocument; text: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    const previous = window.document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previous instanceof HTMLElement) previous.focus() }
  }, []) // Native modal traps focus and restores it on close.
  useEffect(() => {
    let active = true
    setPreview(null); setError('')
    bridge.previewReference(document.id).then(value => { if (active) setPreview(value) }).catch(reason => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [bridge, document.id])
  return <dialog ref={dialog} className={`${styles.settingsDialog} ${styles.referencePreview}`} aria-labelledby="reference-preview-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>提取文字预览</span><h2 id="reference-preview-title">{document.name}</h2></div><IconButton label="关闭资料预览" onClick={onClose}><X size={20} weight="bold" /></IconButton></header>
    <div className={styles.referencePreviewBody}>{error ? <p className={styles.inlineError} role="alert">{error}</p> : preview ? <>
      <p className={styles.formNote}>{preview.document.kind === 'personal' ? '我的项目经历' : '技术参考'} · {preview.document.pageCount} 页 · 版本 {preview.document.revision}</p>
      <pre className={styles.referencePreviewText}>{preview.text || '这份资料尚无可预览文字。'}</pre></> : <p className={styles.formNote} role="status">正在读取资料…</p>}</div>
  </dialog>
}
