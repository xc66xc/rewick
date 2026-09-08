import { useState, type FormEvent } from 'react'
import type { ApiClient } from '../api'
import { message } from '../api'
import { passwordError, userSchema, type User } from '../types'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import styles from '../styles.module.css'
interface UserEditorProps { api: ApiClient; user?: User; onSaved: () => void; onClose: () => void }
export default function UserEditor({ api, user, onSaved, onClose }: UserEditorProps) {
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState(user?.enabled ?? true)
  const [answers, setAnswers] = useState(user?.dailyAnswers ?? 100)
  const [knowledge, setKnowledge] = useState(user?.dailyKnowledgeQueries ?? 100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  async function save() {
    setBusy(true); setError('')
    try {
      await api.request(user ? `/admin/users/${encodeURIComponent(user.id)}` : '/admin/users', userSchema, { method: user ? 'PUT' : 'POST', body: user ? { enabled, dailyAnswers: answers, dailyKnowledgeQueries: knowledge } : { username, password, dailyAnswers: answers, dailyKnowledgeQueries: knowledge } })
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
  const title = user ? `编辑用户 · ${user.username}` : '创建用户'
  return <><Modal title={title} busy={busy} onClose={onClose}><form onSubmit={submit}><fieldset className={styles.modalBody} disabled={busy}>
    <label className={styles.field}>用户名<input required autoComplete="username" value={username} disabled={Boolean(user)} minLength={3} maxLength={64} pattern="[A-Za-z0-9_.@\-]+" onChange={event => setUsername(event.target.value)} /></label>
    {!user && <><label className={styles.field}>初始密码<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} /></label><p className={styles.hint}>至少 12 个字符，不超过 72 个 UTF-8 字节。提交后清空，不会回显。</p></>}
    <div className={styles.twoColumns}><label className={styles.field}>每日回答次数<input type="number" min={0} max={1000000} required value={answers} onChange={event => setAnswers(Number(event.target.value))} /></label><label className={styles.field}>每日知识检索次数<input type="number" min={0} max={1000000} required value={knowledge} onChange={event => setKnowledge(Number(event.target.value))} /></label></div>
    <p className={styles.hint}>0 表示该能力不再允许新请求；已使用次数不会因调整额度而重置。</p>
    {user && <label className={styles.check}><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />启用账号</label>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </fieldset><footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>取消</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? '保存中…' : user ? '保存用户' : '创建用户'}</button></footer></form></Modal>
    {confirm && <ConfirmDialog title={`停用 ${username}`} action="确认停用" busy={busy} onClose={() => setConfirm(false)} onConfirm={() => void save()}><p>停用后会撤销 {username} 的全部登录，阻止新请求。已经建立的流式会话允许结束。</p></ConfirmDialog>}
  </>
}
