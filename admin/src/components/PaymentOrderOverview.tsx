import { CheckCircle, Clock } from '@phosphor-icons/react'
import type { PaymentOrder } from '../payments'
import { money, paymentMethodName, paymentStatus } from '../payments'
import { dateTime } from '../types'
import { duration } from '../duration'
import styles from '../styles.module.css'
import layout from '../pages/PaymentOrdersPage.module.css'
interface PaymentOrderOverviewProps { order: PaymentOrder; busy: boolean; onRefund: () => void; onRefresh: () => void; onClose: () => void }
export default function PaymentOrderOverview({ order, busy, onRefund, onRefresh, onClose }: PaymentOrderOverviewProps) {
  return <section className={layout.detail} aria-label="订单详情"><header className={layout.detailHeader}><div><h3>订单详情</h3><span>{order.id}</span><span className={styles.enabledBadge}>{paymentStatus(order)}</span></div><button className={styles.linkButton} onClick={onClose}>收起详情</button></header>
    <ol className={layout.timeline}><li><CheckCircle size={26} /><div><strong>创建订单</strong><span>{dateTime(order.createdAt)}</span></div></li><li>{order.status === 'paid' ? <CheckCircle size={26} /> : <Clock size={26} />}<div><strong>{order.status === 'paid' ? '支付成功' : order.status === 'closed' ? '订单已关闭' : '等待支付确认'}</strong><span>{order.paidAt ? dateTime(order.paidAt) : '尚无支付成功记录'}</span></div></li><li>{order.credited ? <CheckCircle size={26} /> : <Clock size={26} />}<div><strong>{order.credited ? '时长已到账' : '时长未到账'}</strong><span>{order.credited ? duration(order.durationSeconds) : order.status === 'paid' ? '可重试时长到账' : order.status === 'closed' ? '未支付，未发放时长' : '支付成功后到账'}</span></div></li></ol>
    <dl className={layout.facts}><div><dt>用户</dt><dd>{order.displayName} · ID {order.userId}</dd></div><div><dt>套餐</dt><dd>{order.packageName}</dd></div><div><dt>支付金额</dt><dd>{money(order.totalCents)}</dd></div><div><dt>支付渠道</dt><dd>{paymentMethodName(order.paymentMethod)}</dd></div><div><dt>到期时间</dt><dd>{dateTime(order.expiresAt)}</dd></div><div><dt>已登记退款 / 扣回时长</dt><dd>{money(order.refundedCents)} / {duration(order.deductedSeconds)}</dd></div></dl>
    <footer className={layout.detailActions}><button className={styles.secondaryButton} disabled={busy} onClick={onRefresh}>{busy ? '查询中…' : order.status === 'paid' && !order.credited ? '重试时长到账' : '查询支付结果'}</button>{order.status === 'paid' && order.credited && order.refundedCents < order.totalCents && <button className={styles.linkDanger} disabled={busy} onClick={onRefund}>登记人工退款</button>}</footer>
  </section>
}
