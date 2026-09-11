import { useState } from 'react'
import type { ApiClient } from '../api'
import { message } from '../api'
import { passwordError, type User } from '../types'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import styles from '../styles.module.css'
interface UserSecurityDialogProps { api: ApiClient; user: User; mode: 'password' | 'revoke'; onSaved: () => void; onClose: () => void }
export default function UserSecurityDialog({ api, user, mode, onSaved, onClose }: UserSecurityDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (mode === 'password' && passwordError(password)) { setError(passwordError(password)); return }
    setBusy(true); setError('')
    try { await api.empty(`/admin/users/${encodeURIComponent(user.id)}/${mode === 'password' ? 'password' : 'revoke-tokens'}`, mode === 'password' ? { password } : {}); onSaved() }
    catch (reason) { setError(message(reason)) }
    finally { setPassword(''); setBusy(false) }
  }
  const note = <p>这会撤销 {user.displayName} 的全部登录，需要重新登录后才能发起新请求。正在进行的面试也会结束。</p>
  if (mode === 'revoke') return <ConfirmDialog title={`撤销登录 · ${user.displayName}`} action="撤销全部登录" error={error} busy={busy} onClose={onClose} onConfirm={() => void submit()}>{note}</ConfirmDialog>
  return <Modal title={`重置密码 · ${user.displayName}`} busy={busy} onClose={onClose}><form onSubmit={event => { event.preventDefault(); void submit() }}><fieldset className={styles.modalBody} disabled={busy}>{note}
    <label className={styles.field}>新密码<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} /></label><p className={styles.hint}>至少 12 个字符，不超过 72 个 UTF-8 字节。提交后清空。</p>{error && <p role="alert" className={styles.error}>{error}</p>}
  </fieldset><footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} autoFocus disabled={busy} onClick={onClose}>取消</button><button type="submit" className={styles.dangerButton} disabled={busy}>{busy ? '处理中…' : '重置密码并撤销登录'}</button></footer></form></Modal>
}
