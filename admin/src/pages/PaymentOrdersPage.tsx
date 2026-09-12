import { useState } from 'react'
import { type ApiClient, message } from '../api'
import { duration } from '../duration'
import { dateTime } from '../types'
import { money, paymentOrdersSchema, paymentOrderSchema, paymentStatus, paymentMethodName, type PaymentOrder } from '../payments'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import PaymentRefundDialog from '../components/PaymentRefundDialog'
import styles from '../styles.module.css'
interface PaymentOrdersPageProps { api: ApiClient }
export default function PaymentOrdersPage({ api }: PaymentOrdersPageProps) {
  const { state, reload } = useResource(api, '/admin/payment-orders', paymentOrdersSchema)
  const [filter, setFilter] = useState('')
  const [refunding, setRefunding] = useState<PaymentOrder | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function refresh(order: PaymentOrder) {
    setBusy(order.id); setError(''); setNotice('')
    try { const result = await api.request(`/admin/payment-orders/${encodeURIComponent(order.id)}/refresh`, paymentOrderSchema, { method: 'POST' }); setNotice(`订单 ${result.id}：${paymentStatus(result)}`); reload() }
    catch (failure) { setError(message(failure)) } finally { setBusy(null) }
  }
  const orders = state.kind === 'ready' ? state.data.filter(order => `${order.displayName} ${order.id} ${order.packageName}`.toLowerCase().includes(filter.toLowerCase())) : []
  return <section className={styles.pageBody} aria-label="支付订单"><div className={styles.sectionHeading}><div><h2>套餐购买订单</h2><p>展示最近 100 条订单。查询支付结果会重试已支付订单的时长到账。</p></div><button type="button" className={styles.secondaryButton} onClick={reload}>刷新订单列表</button></div>
    <label className={styles.searchField}>筛选当前列表<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="用户、订单号或套餐名称" /></label>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : orders.length ? <div className={styles.tableScroll}><table><caption className={styles.srOnly}>支付订单列表</caption><thead><tr><th>用户 / 订单</th><th>套餐</th><th>金额 / 时长</th><th>状态 / 退款</th><th>时间</th><th>操作</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}>
      <th scope="row">{order.displayName}<span className={styles.tableDetail}>用户 ID {order.userId}</span><span className={styles.tableDetail}>{order.id}</span></th>
      <td>{order.packageName}<span className={styles.tableDetail}>{paymentMethodName(order.paymentMethod)}支付</span></td><td className={styles.numeric}>{money(order.totalCents)}<span className={styles.tableDetail}>{duration(order.durationSeconds)}</span></td>
      <td>{paymentStatus(order)}{order.refundedCents > 0 && <span className={styles.tableDetail}>已登记退款 {money(order.refundedCents)}<br />已扣回 {duration(order.deductedSeconds)}</span>}</td>
      <td>{dateTime(order.createdAt)}<span className={styles.tableDetail}>{order.paidAt ? `支付：${dateTime(order.paidAt)}` : `过期：${dateTime(order.expiresAt)}`}</span></td>
      <td><div className={styles.rowActions}><button className={styles.secondaryButton} disabled={busy !== null} onClick={() => void refresh(order)}>{busy === order.id ? '查询中…' : order.status === 'paid' && !order.credited ? '重试时长到账' : '查询支付结果'}</button>{order.status === 'paid' && order.credited && order.refundedCents < order.totalCents && <button className={styles.linkDanger} disabled={busy !== null} onClick={() => setRefunding(order)}>登记人工退款</button>}</div></td>
    </tr>)}</tbody></table></div> : <LoadState>暂无匹配的支付订单。</LoadState>}
    {refunding && <PaymentRefundDialog api={api} order={refunding} onClose={() => setRefunding(null)} onSaved={() => { setRefunding(null); setNotice('人工退款已登记，时长已扣回。'); reload() }} />}
  </section>
}
