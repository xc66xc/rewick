import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { PaymentOrder } from '../../../../shared/payment'
import { Button } from '../ui/button'
import { Modal } from '../ui/dialog'
import { formatDuration } from '../../hooks/useInterviewTime'
import { toast } from '../ui/toast'

export const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`
export function orderStatus(order: PaymentOrder) {
  if (order.refundedCents > 0) return `已登记退款 ${money(order.refundedCents)}`
  if (order.credited) return '支付成功 · 时长已到账'
  if (order.status === 'paid') return '支付成功 · 正在入账'
  if (order.status === 'closed') return '订单已关闭'
  return order.status === 'creating' ? '正在确认支付订单' : '等待微信支付'
}
interface Props { order: PaymentOrder; busy: boolean; onClose: () => void; onRefresh: () => void }
export default function PaymentOrderDialog({ order, busy, onClose, onRefresh }: Props) {
  const [image, setImage] = useState('')
  const [now, setNow] = useState(Date.now())
  const remaining = Math.max(0, Math.ceil((Date.parse(order.expiresAt) - now) / 1000))
  const payable = !order.credited && order.status === 'pending' && remaining > 0
  useEffect(() => {
    let live = true
    setImage('')
    if (order.codeUrl && payable) void QRCode.toDataURL(order.codeUrl, { width: 264, margin: 2 }).then(value => { if (live) setImage(value) }).catch(() => { if (live) toast.show('二维码生成失败，请关闭后重新打开订单。', { type: 'error' }) })
    return () => { live = false }
  }, [order.codeUrl, payable])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <Modal open onOpenChange={open => { if (!open) onClose() }} title="微信扫码购买时长" footer={<><Button onClick={onClose}>关闭</Button><Button variant="primary" loading={busy} onClick={onRefresh}>查看支付结果</Button></>}>
    <div className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-lg font-semibold">{order.packageName}</h2>
      <p className="text-3xl font-semibold text-accent-text">{money(order.totalCents)}</p>
      <p className="text-sm text-text-secondary">购买 {formatDuration(order.durationSeconds)} · 长期有效</p>
      {payable && image && <img src={image} width={264} height={264} alt="使用手机微信扫描此二维码支付" />}
      {payable && <p className="text-xs text-text-secondary">请使用手机微信扫码 · 剩余 {formatDuration(remaining)}</p>}
      {!payable && !order.credited && order.status !== 'closed' && <p className="text-xs text-text-secondary">{remaining === 0 ? '二维码已过期，正在核实订单最终状态。' : '正在核实订单，请稍候。'}</p>}
      <p role="status" className="text-sm font-medium">{orderStatus(order)}</p>
      <p className="text-xs leading-relaxed text-text-muted">关闭窗口不会取消订单，可在购买记录继续查看。时长到账后不会自动开始面试。</p>
      <p className="break-all font-mono text-xs text-text-muted">订单号：{order.id}</p>
    </div>
  </Modal>
}
