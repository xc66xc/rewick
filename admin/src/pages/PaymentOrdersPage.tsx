import { ArrowClockwise, MagnifyingGlass } from '@phosphor-icons/react'
import PaymentOrderOverview from '../components/PaymentOrderOverview'
import Pagination from '../components/Pagination'
import layout from './PaymentOrdersPage.module.css'
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
  const [status, setStatus] = useState('all')
  const [channel, setChannel] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  const orders = state.kind === 'ready' ? state.data.filter(order => `${order.displayName} ${order.id} ${order.packageName} ${paymentMethodName(order.paymentMethod)}`.toLowerCase().includes(filter.trim().toLowerCase()) && (channel === 'all' || order.paymentMethod === channel) && (status === 'all' || (status === 'pending' ? ['pending', 'creating', 'cancelling'].includes(order.status) : order.status === status))) : []
  const currentPage = Math.min(page, Math.max(1, Math.ceil(orders.length / 20)))
  const selected = orders.find(order => order.id === selectedId)
  function resetSelection() { setPage(1); setSelectedId(null) }
  return <section className={styles.pageBody} aria-label="支付订单"><div className={styles.sectionHeading}><div><h2>支付订单</h2><p>查看支付状态与时长到账 · 筛选范围为最近 100 条订单</p></div><button type="button" className={styles.primaryButton} disabled={busy !== null || state.kind === 'loading'} onClick={reload}><ArrowClockwise size={18} />刷新订单列表</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={layout.panel}><div className={layout.toolbar}><label className={layout.search}><span className={styles.srOnly}>筛选当前列表</span><MagnifyingGlass size={20} /><input value={filter} onChange={event => { setFilter(event.target.value); resetSelection() }} placeholder="用户、订单号、套餐或渠道" /></label><div className={layout.tabs} role="group" aria-label="订单状态">{[['all', '全部'], ['pending', '待支付'], ['paid', '已支付'], ['closed', '已关闭']].map(([value, label]) => <button key={value} aria-pressed={status === value} onClick={() => { setStatus(value); resetSelection() }}>{label}</button>)}</div><select className={layout.channel} aria-label="支付渠道" value={channel} onChange={event => { setChannel(event.target.value); resetSelection() }}><option value="all">全部渠道</option><option value="wechat">微信</option><option value="alipay">支付宝</option><option value="zpay">ZPAY</option></select></div>
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : orders.length ? <><div className={styles.tableScroll}><table className={layout.table}><caption className={styles.srOnly}>支付订单列表</caption><thead><tr><th>用户</th><th>订单号</th><th>套餐 / 时长</th><th>支付金额</th><th>支付渠道</th><th>支付状态</th><th>时长到账</th><th>操作</th></tr></thead><tbody>{orders.slice((currentPage - 1) * 20, currentPage * 20).map(order => <tr key={order.id} className={selectedId === order.id ? layout.selected : undefined}>
      <th scope="row">{order.displayName}<span className={styles.tableDetail}>ID {order.userId}</span></th><td className={layout.orderId}>{order.id}<span className={styles.tableDetail}>{dateTime(order.createdAt)}</span></td>
      <td>{order.packageName}<span className={styles.tableDetail}>{duration(order.durationSeconds)}</span></td><td className={styles.numeric}>{money(order.totalCents)}</td><td>{paymentMethodName(order.paymentMethod)}支付</td>
      <td><span className={order.status === 'closed' ? styles.mutedBadge : styles.enabledBadge}>{order.status === 'paid' ? '已支付' : order.status === 'pending' ? '待支付' : order.status === 'closed' ? '已关闭' : paymentStatus(order)}</span>{order.refundedCents > 0 && <span className={styles.tableDetail}>已登记退款 {money(order.refundedCents)}</span>}</td><td><span className={order.credited ? styles.enabledBadge : styles.mutedBadge}>{order.credited ? '已到账' : order.status === 'paid' ? '待到账' : '—'}</span></td>
      <td><div className={styles.rowActions}><button className={styles.linkButton} aria-expanded={selectedId === order.id} onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}>查看详情</button>{!order.credited && order.status !== 'closed' && <button className={styles.linkButton} disabled={busy !== null} onClick={() => void refresh(order)}>{busy === order.id ? '查询中…' : order.status === 'paid' ? '重试时长到账' : '查询支付结果'}</button>}</div></td>
    </tr>)}</tbody></table></div>
    {selected && <PaymentOrderOverview order={selected} busy={busy !== null} onRefresh={() => void refresh(selected)} onRefund={() => setRefunding(selected)} onClose={() => setSelectedId(null)} />}
    <Pagination page={currentPage} size={20} total={orders.length} onChange={value => { setPage(value); setSelectedId(null) }} />
    </> : <LoadState>暂无匹配的支付订单。</LoadState>}</div>
    {refunding && <PaymentRefundDialog api={api} order={refunding} onClose={() => setRefunding(null)} onSaved={() => { setRefunding(null); setNotice('人工退款已登记，时长已扣回。'); reload() }} />}
  </section>
}
