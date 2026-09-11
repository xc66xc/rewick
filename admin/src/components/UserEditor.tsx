import { useState, type FormEvent } from 'react'
import type { ApiClient } from '../api'
import { message } from '../api'
import { passwordError, userSchema, type User } from '../types'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import DurationInput from './DurationInput'
import styles from '../styles.module.css'
interface UserEditorProps { api: ApiClient; user?: User; onSaved: () => void; onClose: () => void }
export default function UserEditor({ api, user, onSaved, onClose }: UserEditorProps) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState(user?.enabled ?? true)
  const [availableSeconds, setAvailableSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  async function save() {
    setBusy(true); setError('')
    try {
      await api.request(user ? `/admin/users/${encodeURIComponent(user.id)}` : '/admin/users', userSchema, { method: user ? 'PUT' : 'POST', body: user ? { enabled } : { identifier: identifier.trim(), password, availableSeconds } })
      onSaved()
    } catch (reason) { setError(message(reason)); setConfirm(false) }
    finally { setPassword(''); setBusy(false) }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!user && passwordError(password)) { setError(passwordError(password)); return }
    if (user?.enabled && !enabled) setConfirm(true)
    else void save()
  }
  const title = user ? `编辑用户 · ${user.displayName}` : '创建用户'
  return <><Modal title={title} busy={busy} onClose={onClose}><form onSubmit={submit}><fieldset className={styles.modalBody} disabled={busy}>
    {user ? <label className={styles.field}>显示名称<input value={user.displayName} readOnly /></label> : <label className={styles.field}>登录账号<input required autoComplete="username" value={identifier} minLength={3} maxLength={64} pattern="[A-Za-z0-9_.@\-]+" onChange={event => setIdentifier(event.target.value)} /></label>}
    {!user && <><label className={styles.field}>初始密码<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} /></label><p className={styles.hint}>至少 12 个字符，不超过 72 个 UTF-8 字节。提交后清空，不会回显。</p></>}
    {!user && <><DurationInput label="初始可用时长" value={availableSeconds} onChange={setAvailableSeconds} /><p className={styles.hint}>默认 0 秒。可用时长为 0 时无法开始面试，仍可登录和准备资料。</p></>}
    {user && <label className={styles.check}><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />启用账号</label>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </fieldset><footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>取消</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? '保存中…' : user ? '保存用户' : '创建用户'}</button></footer></form></Modal>
    {confirm && <ConfirmDialog title={`停用 ${user?.displayName}`} action="确认停用" busy={busy} onClose={() => setConfirm(false)} onConfirm={() => void save()}><p>停用后会撤销 {user?.displayName} 的全部登录，并结束正在进行的面试。</p></ConfirmDialog>}
  </>
}
