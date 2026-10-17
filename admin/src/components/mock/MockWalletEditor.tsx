import { useRef, useState } from 'react'
import { ApiError, message, type ApiClient } from '../../api'
import { duration, operationId } from '../../duration'
import { useResource } from '../../hooks/useResource'
import { mockWalletSchema } from '../../mock-interviews'
import type { User } from '../../types'
import DurationInput from '../DurationInput'
import LoadState from '../LoadState'
import Modal from '../Modal'
import styles from '../../styles.module.css'
interface Props { api: ApiClient; user: User; onClose: () => void; onSaved: () => void }
export default function MockWalletEditor({ api, user, onClose, onSaved }: Props) {
  const path = `/admin/users/${encodeURIComponent(user.id)}/mock-wallet`
  const { state, reload } = useResource(api, path, mockWalletSchema)
  const [seconds, setSeconds] = useState(0)
  const [subtract, setSubtract] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const attempt = useRef<{ signature: string; requestId: string } | null>(null)
  async function save() {
    if (state.kind !== 'ready' || inFlight.current) return
    const deltaSeconds = subtract ? -seconds : seconds
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 315360000 || !reason.trim()) { setError('请填写大于 0 的有效时长和调整原因。'); return }
    if (state.data.availableSeconds + deltaSeconds < 0) { setError('扣除时长不能超过当前模拟余额。'); return }
    const signature = JSON.stringify({ deltaSeconds, reason: reason.trim() })
    if (attempt.current?.signature !== signature) attempt.current = { signature, requestId: operationId() }
    inFlight.current = true; setBusy(true); setError('')
    try { await api.request(`${path}/adjustments`, mockWalletSchema, { method: 'POST', body: { requestId: attempt.current.requestId, deltaSeconds, reason: reason.trim() } }); onSaved() }
    catch (failure) { setError(message(failure)); if (failure instanceof ApiError && failure.status === 409) reload() }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Modal title={`调整模拟时长 · ${user.displayName}`} busy={busy} onClose={onClose}>{state.kind !== 'ready' ? <div className={styles.modalBody}><LoadState error={state.kind === 'error' ? state.error : undefined} onRetry={reload} /></div> : <form onSubmit={event => { event.preventDefault(); void save() }}><fieldset className={styles.modalBody} disabled={busy}>
    <p>模拟余额：<strong>{duration(state.data.availableSeconds)}</strong></p><p className={styles.hint}>独立于辅助面试余额，仅用于 AI 模拟面试。调整会记录管理员和原因。</p>
    <label className={styles.field}>调整方式<select value={subtract ? 'subtract' : 'add'} onChange={event => setSubtract(event.target.value === 'subtract')}><option value="add">增加模拟时长</option><option value="subtract">扣除模拟时长</option></select></label>
    <DurationInput value={seconds} onChange={setSeconds} label="模拟时长" /><label className={styles.field}>调整原因<textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <p role="status">调整后预计模拟余额：{duration(state.data.availableSeconds + (subtract ? -seconds : seconds))}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </fieldset><footer className={styles.modalFooter}><button type="button" disabled={busy} className={styles.secondaryButton} onClick={onClose}>取消</button><button type="submit" disabled={busy} className={styles.primaryButton}>{busy ? '保存中…' : '保存模拟时长'}</button></footer></form>}</Modal>
}
