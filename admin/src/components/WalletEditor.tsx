import { useState } from 'react'
import { ApiError, type ApiClient, message } from '../api'
import { duration, operationId } from '../duration'
import { useResource } from '../hooks/useResource'
import type { User } from '../types'
import { walletSchema, type Adjustment, type Wallet } from '../wallet'
import DurationInput from './DurationInput'
import LoadState from './LoadState'
import Modal from './Modal'
import styles from '../styles.module.css'

interface WalletEditorProps { api: ApiClient; user: User; onSaved: () => void; onClose: () => void }
export default function WalletEditor({ api, user, onSaved, onClose }: WalletEditorProps) {
  const [busy, setBusy] = useState(false)
  const path = `/admin/users/${encodeURIComponent(user.id)}/wallet`
  const { state, reload } = useResource(api, path, walletSchema)
  return <Modal title={`调整可用时长 · ${user.displayName}`} busy={busy} onClose={onClose}>
    {state.kind === 'ready' ? <WalletForm key={state.data.version} api={api} path={path} wallet={state.data} onSaved={onSaved} onClose={onClose} onReload={reload} onBusyChange={setBusy} /> : <div className={styles.modalBody}>{state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <LoadState />}</div>}
  </Modal>
}

interface WalletFormProps { api: ApiClient; path: string; wallet: Wallet; onSaved: () => void; onClose: () => void; onReload: () => void; onBusyChange: (busy: boolean) => void }
function WalletForm({ api, path, wallet, onSaved, onClose, onReload, onBusyChange }: WalletFormProps) {
  const [operation, setOperation] = useState<Adjustment>('add')
  const [seconds, setSeconds] = useState(0)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [attempt, setAttempt] = useState<{ signature: string; id: string } | null>(null)
  const after = operation === 'set' ? seconds : wallet.availableSeconds + (operation === 'add' ? seconds : -seconds)
  async function save() {
    if (!reason.trim() || !Number.isSafeInteger(seconds) || seconds < 0 || after < 0 || after > 315360000) { setError('请填写有效时长和调整原因，调整后可用时长不能小于 0 或超过 87600 小时。'); return }
    const signature = JSON.stringify({ operation, seconds, reason: reason.trim(), version: wallet.version })
    const id = attempt?.signature === signature ? attempt.id : operationId()
    setAttempt({ signature, id }); setBusy(true); onBusyChange(true); setError('')
    try {
      await api.request(`${path}/adjust`, walletSchema, { method: 'POST', body: { requestId: id, operation, seconds, expectedVersion: wallet.version, reason: reason.trim() } })
      onSaved()
    } catch (failure) { setError(message(failure)); setConflict(failure instanceof ApiError && failure.status === 409) }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}><fieldset className={styles.modalBody} disabled={busy || conflict}>
    <p>当前可用时长：<strong>{duration(wallet.availableSeconds)}</strong></p>
    {wallet.session?.status === 'active' && <p className={styles.hint}>用户正在面试。保存时会先结算已经使用的时间，再进行调整；设为 0 会结束面试。</p>}
    <label className={styles.field}>调整方式<select value={operation} onChange={event => setOperation(event.target.value as Adjustment)}><option value="add">增加时长</option><option value="subtract">扣除时长</option><option value="set">设定剩余时长</option></select></label>
    <DurationInput value={seconds} onChange={setSeconds} />
    <p role="status">调整后预计可用：<strong>{after < 0 ? '时长不足' : duration(after)}</strong></p>
    <label className={styles.field}>调整原因<textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    {operation === 'set' && seconds === 0 && <p className={styles.hint}>保存后该用户不能开始面试，正在进行的面试也会结束。</p>}
  </fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}
    <footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>取消</button>{conflict ? <button type="button" className={styles.primaryButton} onClick={onReload}>重新加载当前时长</button> : <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? '保存中…' : '保存时长'}</button>}</footer>
  </form>
}
