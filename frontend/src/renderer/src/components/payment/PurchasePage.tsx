import { ShoppingBag, ArrowsClockwise } from '@phosphor-icons/react'
import type { DesktopBridge } from '../../../../shared/types'
import usePayments from '../../hooks/usePayments'
import { formatDuration } from '../../hooks/useInterviewTime'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { Segmented } from '../ui/segmented'
import { Eyebrow } from '../ui/pill'
import PaymentOrderDialog, { money, orderStatus, paymentBrand } from './PaymentOrderDialog'

interface Props { bridge: DesktopBridge; scope: string; remaining: number; onCredited: () => Promise<void> }
export default function PurchasePage({ bridge, scope, remaining, onCredited }: Props) {
  const payments = usePayments(bridge, scope, onCredited)
  const methodOptions = (payments.catalog?.paymentMethods ?? []).map(value => ({ value, label: `${paymentBrand(value)}支付` }))
  const canBuy = payments.catalog?.paymentAvailable && payments.paymentMethod !== null && payments.catalog.paymentMethods.includes(payments.paymentMethod)
  return <section className="flex flex-1 flex-col gap-6 p-8 max-[820px]:p-5" aria-labelledby="purchase-title">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><Eyebrow>为下一次机会做好准备</Eyebrow><h1 id="purchase-title" tabIndex={-1} className="text-2xl font-semibold">购买时长</h1><p className="mt-2 text-sm text-text-secondary">可用时长 {formatDuration(remaining)} · 购买时长长期有效，重复购买可累加。</p></div>
      <Button loading={payments.loading} onClick={() => void payments.reload()}><ArrowsClockwise aria-hidden />刷新套餐与订单</Button>
    </header>
    {payments.loading && !payments.catalog && <p role="status" className="text-sm text-text-secondary">正在加载套餐…</p>}
    {payments.catalog && !payments.catalog.paymentAvailable && <EmptyState icon={<ShoppingBag />} title="支付暂未开放" description="平台正在准备支付服务。您可以先查看套餐，开放后再购买。" />}
    {payments.catalog?.packages.length === 0 && <EmptyState icon={<ShoppingBag />} title="暂无可购买套餐" description="套餐发布后将在这里显示。" />}
    {methodOptions.length > 0 && <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">支付方式</span><Segmented aria-label="支付方式" value={payments.paymentMethod ?? ''} disabled={payments.busy} options={methodOptions} onValueChange={value => { if (value === 'wechat' || value === 'alipay') payments.setPaymentMethod(value) }} />{!payments.paymentMethod && <span className="text-xs text-text-secondary">原支付方式已不可用，请重新选择。</span>}</div>}
    <ul className="grid list-none grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[730px]:grid-cols-1">
      {payments.catalog?.packages.filter(item => item.enabled).map(item => <li key={item.id} className="flex flex-col gap-4 rounded-card border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{item.name}</h2><p className="text-sm text-text-secondary">{item.description}</p>
        <p className="font-mono text-xl font-semibold text-accent-text">{formatDuration(item.durationSeconds)}</p>
        <div className="flex flex-wrap items-baseline gap-2"><strong className="text-2xl">{money(item.priceCents)}</strong>{item.discountBps < 10000 && <><del className="text-xs text-text-muted">{money(item.originalPriceCents)}</del><span className="text-xs text-accent-text">{item.discountBps / 1000} 折</span></>}</div>
        <p className="text-xs text-text-muted">长期有效 · 进入面试工作台后计时</p>
        <Button className="mt-auto" variant="primary" disabled={!canBuy || payments.busy} onClick={() => void payments.buy(item)}>购买 {item.name}</Button>
      </li>)}
    </ul>
    <h2 className="mt-4 text-lg font-semibold">购买记录 <span className="text-xs font-normal text-text-muted">最近 100 笔</span></h2>
    {!payments.loading && payments.orders.length === 0 && <p className="text-sm text-text-secondary">暂无购买记录。</p>}
    <ul className="flex list-none flex-col gap-3">
      {payments.orders.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card p-4">
        <div><h3 className="font-semibold">{order.packageName} · {money(order.totalCents)}</h3><p className="mt-1 text-xs text-text-secondary">{new Date(order.createdAt).toLocaleString()} · {formatDuration(order.durationSeconds)}</p><p className="mt-1 text-xs">{paymentBrand(order.paymentMethod)}支付 · {orderStatus(order)}</p></div>
        <Button onClick={() => payments.setSelected(order)}>查看订单</Button>
      </li>)}
    </ul>
    {payments.selected && <PaymentOrderDialog order={payments.selected} busy={payments.busy} onCancel={() => { if (payments.selected) void payments.cancel(payments.selected) }} onClose={() => payments.setSelected(null)} onRefresh={() => { if (payments.selected) void payments.refresh(payments.selected) }} />}
  </section>
}
