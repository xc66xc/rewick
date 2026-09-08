import { useEffect, useRef, type ReactNode } from 'react'
import styles from '../styles.module.css'
interface ModalProps { title: string; busy?: boolean; onClose: () => void; children: ReactNode }
export default function Modal({ title, busy = false, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const previous = document.activeElement; const element = ref.current; element?.showModal(); return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }, []) // Native dialog keeps focus inside this mounted modal.
  return <dialog ref={ref} className={styles.modal} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className={styles.modalHeader}><h2>{title}</h2><button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy} aria-label={`关闭${title}`}>关闭</button></div>{children}
  </dialog>
}
