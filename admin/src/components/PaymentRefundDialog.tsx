import { useState } from 'react'
import { type ApiClient, message } from '../api'
import { operationId } from '../duration'
import { money, paymentOrderSchema, type PaymentOrder } from '../payments'
import DurationInput from './DurationInput'
import Modal from './Modal'
import styles from '../styles.module.css'
import paymentStyles from './PaymentRefundDialog.module.css'
interface PaymentRefundDialogProps { api: ApiClient; order: PaymentOrder; onSaved: () => void; onClose: () => void }
export default function PaymentRefundDialog({ api, order, onSaved, onClose }: PaymentRefundDialogProps) {
  const [amount, setAmount] = useState((order.totalCents - order.refundedCents) / 100)
  const [seconds, setSeconds] = useState(order.durationSeconds - order.deductedSeconds)
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState<{ signature: string; id: string } | null>(null)
  async function save() {
    if (!confirmed) return
    const fields = { refundCents: Math.round(amount * 100), deductSeconds: seconds, reference: reference.trim(), reason: reason.trim() }
    const signature = JSON.stringify(fields)
    const requestId = attempt?.signature === signature ? attempt.id : operationId()
    setAttempt({ signature, id: requestId }); setBusy(true); setError('')
    try { await api.request(`/admin/payment-orders/${encodeURIComponent(order.id)}/refund`, paymentOrderSchema, { method: 'POST', body: { ...fields, requestId } }); onSaved() }
    catch (failure) { setError(message(failure)) } finally { setBusy(false) }
  }
  return <Modal title="登记人工退款" busy={busy} onClose={onClose}><form className={paymentStyles.refundForm} onSubmit={event => { event.preventDefault(); void save() }}><div className={`${styles.modalBody} ${paymentStyles.refundBody}`}><fieldset disabled={busy} className={styles.formStack}>
    <p className={styles.warning}>本操作不会调用微信退款。请先在微信商户平台完成实际退款，再登记凭证并扣回时长。</p><p>{order.displayName} · {order.packageName}<span className={styles.tableDetail}>订单 {order.id} · 剩余可登记退款 {money(order.totalCents - order.refundedCents)}</span></p>
    <label className={styles.field}>已退款金额（元）<input required type="number" min={0.01} max={(order.totalCents - order.refundedCents) / 100} step={0.01} value={amount} onChange={event => setAmount(Number(event.target.value))} /></label>
    <DurationInput label="本次扣回时长" value={seconds} onChange={setSeconds} />
    <p className={styles.hint}>扣回时长不能超过该订单尚未扣回的时长或用户当前可用时长。</p>
    <label className={styles.field}>微信退款单号／凭证<input required maxLength={200} value={reference} onChange={event => setReference(event.target.value)} /></label><label className={styles.field}>退款原因<textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <label className={styles.check}><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已在微信商户平台完成实际退款</label>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </fieldset></div><footer className={`${styles.modalFooter} ${paymentStyles.refundActions}`}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>取消</button><button type="submit" className={styles.dangerButton} disabled={busy || !confirmed}>{busy ? '登记中…' : '登记退款并扣回时长'}</button></footer></form></Modal>
}
