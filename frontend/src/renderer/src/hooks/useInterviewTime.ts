import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge, WalletState } from '../../../shared/types'
import { errorMessage } from './useSettings'

export function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds))
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(item => String(item).padStart(2, '0')).join(':')
}
export function useInterviewTime(bridge: DesktopBridge) {
  const [wallet, setWallet] = useState<WalletState | null>(null)
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshPending = useRef(false)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [warning, setWarning] = useState('')
  const received = useRef(performance.now())
  const warned = useRef(new Set<number>())
  const startingEnvironment = useRef<string | null>(null)
  const requestId = useRef<string | null>(null)
  const accept = (value: WalletState) => { received.current = performance.now(); setElapsed(0); setWallet(value) }
  useEffect(() => {
    let live = true
    void bridge.getWallet().then(value => { if (live) accept(value) }).catch(reason => { if (live) setError(errorMessage(reason)) })
    const unsubscribe = bridge.onEvent(event => {
      if (event.kind !== 'wallet-changed') return
      accept(event.wallet)
      setActive(event.wallet.session?.status === 'active')
    })
    return () => { live = false; unsubscribe() }
  }, [bridge])
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - received.current) / 1000)), 500)
    return () => clearInterval(timer)
  }, [active])
  const remaining = Math.max(0, (wallet?.availableSeconds ?? 0) - (active ? elapsed : 0))
  useEffect(() => {
    if (!active) return
    for (const threshold of [300, 60]) if (remaining <= threshold && !warned.current.has(threshold)) {
      warned.current.add(threshold); setWarning(`可用面试时长不足 ${threshold / 60} 分钟。`)
    }
  }, [active, remaining])
  async function start(environmentId: string) {
    if (startingEnvironment.current !== environmentId) requestId.current = null
    startingEnvironment.current = environmentId
    setBusy(true); setError('')
    requestId.current ??= crypto.randomUUID()
    try { const value = await bridge.startInterview(requestId.current, environmentId); accept(value); setActive(value.session?.status === 'active'); requestId.current = null; warned.current.clear(); setWarning('') }
    catch (reason) { setError(errorMessage(reason)); throw reason }
    finally { setBusy(false) }
  }
  async function end() {
    setBusy(true); setActive(false); setWarning(''); setError('')
    try { const value = await bridge.endInterview(); if (value) accept(value) }
    catch (reason) { setError(`${errorMessage(reason)} 本机已停止使用，服务端最迟将在连接有效期结束时停止计时。`) }
    finally { setBusy(false) }
  }
  async function refresh() {
    if (refreshPending.current) return
    refreshPending.current = true
    setRefreshing(true)
    try { accept(await bridge.getWallet()); setError('') }
    catch (reason) { setError(errorMessage(reason)) }
    finally { refreshPending.current = false; setRefreshing(false) }
  }
  return { wallet, active, busy, refreshing, error, warning, remaining, used: (wallet?.session?.usedSeconds ?? 0) + (active ? elapsed : 0), start, end, refresh }
}
