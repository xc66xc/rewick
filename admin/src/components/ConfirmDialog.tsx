import type { ReactNode } from 'react'
import Modal from './Modal'
import styles from '../styles.module.css'
interface ConfirmDialogProps { title: string; children: ReactNode; action: string; busy?: boolean; error?: string; onConfirm: () => void; onClose: () => void }
export default function ConfirmDialog({ title, children, action, busy = false, error, onConfirm, onClose }: ConfirmDialogProps) {
  return <Modal title={title} busy={busy} onClose={onClose}><div className={styles.modalBody}>{children}{error && <p role="alert" className={styles.error}>{error}</p>}</div><footer className={styles.modalFooter}>
    <button className={styles.secondaryButton} autoFocus type="button" disabled={busy} onClick={onClose}>取消</button><button className={styles.dangerButton} type="button" disabled={busy} onClick={onConfirm}>{busy ? '处理中…' : action}</button>
  </footer></Modal>
}
