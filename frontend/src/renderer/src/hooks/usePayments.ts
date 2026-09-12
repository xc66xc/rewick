import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge } from '../../../shared/types'
import type { PackageCatalog, PaymentMethod, PaymentOrder, TimePackage } from '../../../shared/payment'
import { toast } from '../components/ui/toast'
import { errorMessage } from './useSettings'

export default function usePayments(bridge: DesktopBridge, scope: string, onCredited: () => Promise<void>) {
  const [catalog, setCatalog] = useState<PackageCatalog | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const methodInitialized = useRef(false)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [selected, setSelected] = useState<PaymentOrder | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const live = useRef(true)
  const locked = useRef(false)
  const pollFailed = useRef(false)
  const credited = useRef(new Set<string>())
  const onCredit = useRef(onCredited)
  onCredit.current = onCredited
  async function accept(order: PaymentOrder) {
    if (!live.current) return
    setOrders(items => [order, ...items.filter(item => item.id !== order.id)])
    setSelected(current => current?.id === order.id ? order : current)
    if (order.credited && !credited.current.has(order.id)) {
      credited.current.add(order.id)
      await onCredit.current()
      if (live.current) toast.show('支付成功，购买时长已到账，长期有效。', { type: 'success' })
    }
  }
  async function reload() {
    setLoading(true)
    try {
      const [nextCatalog, nextOrders] = await Promise.all([bridge.getPackageCatalog(), bridge.getPaymentOrders()])
      if (!live.current) return
      setCatalog(nextCatalog); setOrders(nextOrders)
      if (!methodInitialized.current && nextCatalog.paymentMethods.length) {
        methodInitialized.current = true
        setPaymentMethod(nextCatalog.paymentMethods.includes('wechat') ? 'wechat' : nextCatalog.paymentMethods[0])
      } else {
        setPaymentMethod(current => current && nextCatalog.paymentMethods.includes(current) ? current : null)
      }
      const newCredits = nextOrders.filter(item => item.credited && !credited.current.has(item.id))
      newCredits.forEach(item => credited.current.add(item.id))
      if (newCredits.length) await onCredit.current()
    } catch (reason) { if (live.current) toast.show(errorMessage(reason), { type: 'error' }) }
    finally { if (live.current) setLoading(false) }
  }
  useEffect(() => {
    live.current = true
    void reload()
    return () => { live.current = false }
    // The purchase page is keyed by account scope; IPC also rejects stale-account replies.
  }, [bridge])
  async function buy(item: TimePackage) {
    if (locked.current) return
    if (!catalog?.paymentAvailable || !paymentMethod || !catalog.paymentMethods.includes(paymentMethod)) {
      toast.show('请选择当前可用的支付方式。', { type: 'error' }); return
    }
    locked.current = true; setBusy(true)
    const storageKey = `payment-request:${scope}:${item.id}:${item.version}:${paymentMethod}`
    try {
      const requestId = sessionStorage.getItem(storageKey) ?? crypto.randomUUID()
      sessionStorage.setItem(storageKey, requestId)
      const order = await bridge.createPaymentOrder({ packageId: item.id, packageVersion: item.version, paymentMethod, requestId })
      if (!live.current) return
      sessionStorage.removeItem(storageKey)
      setSelected(order); await accept(order)
    } catch (reason) { if (live.current) toast.show(errorMessage(reason), { type: 'error' }) }
    finally { locked.current = false; if (live.current) setBusy(false) }
  }
  async function refresh(order: PaymentOrder, silent = false) {
    if (locked.current) return
    locked.current = true; if (!silent) setBusy(true)
    try {
      await accept(await bridge.refreshPaymentOrder(order.id))
      pollFailed.current = false
    } catch (reason) {
      if (live.current && (!silent || !pollFailed.current)) toast.show(`${errorMessage(reason)} 可稍后点击查看支付结果，订单不会丢失。`, { type: 'error' })
      pollFailed.current = true
    }
    finally { locked.current = false; if (live.current && !silent) setBusy(false) }
  }
  const selectedId = selected?.id
  const settled = selected?.credited || selected?.status === 'closed'
  useEffect(() => {
    if (!selectedId || settled) return
    const timer = setInterval(() => { if (selected) void refresh(selected, true) }, 5000)
    return () => clearInterval(timer)
  }, [selectedId, settled])
  return { catalog, paymentMethod, setPaymentMethod, orders, selected, setSelected, busy, loading, reload, buy, refresh }
}
