import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge, Settings } from '../../../shared/types'
import { clearLibraryDrafts } from './useLibraryDraft'
import { errorMessage, type useSettings } from './useSettings'

function identity(settings: Settings) {
  const platform = settings.platform
  return platform?.authenticated && platform.user ? `${platform.baseUrl}|${platform.user.id}` : ''
}

export function useDesktopAuth(bridge: DesktopBridge | undefined, config: ReturnType<typeof useSettings>) {
  const [verified, setVerified] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const attempted = useRef('')
  const blocked = useRef(false)
  const epoch = useRef(0)
  const latest = useRef(config)
  latest.current = config
  const accountKey = identity(config.settings)
  const expiresAt = config.settings.platform?.expiresAt

  function accept(settings: Settings) {
    blocked.current = false; epoch.current++; clearLibraryDrafts()
    latest.current.apply(settings)
    const key = identity(settings)
    attempted.current = key
    setVerified(key); setChecking(false); setError('')
  }
  useEffect(() => {
    if (config.loading || !bridge) return
    if (!accountKey) {
      epoch.current++; attempted.current = ''; setVerified(''); setChecking(false); clearLibraryDrafts()
      return
    }
    if (blocked.current || verified === accountKey || attempted.current === accountKey) return
    attempted.current = accountKey
    const request = ++epoch.current
    setChecking(true); setError('')
    void bridge.refreshPlatform().then(value => {
      if (request !== epoch.current) return
      latest.current.apply(value); clearLibraryDrafts()
      setVerified(identity(value))
      if (!identity(value)) setError('登录已失效，请重新登录。')
    }).catch(reason => { if (request === epoch.current) { setVerified(''); setError(errorMessage(reason)) } })
      .finally(() => { if (request === epoch.current) setChecking(false) })
    return () => { if (request === epoch.current) { epoch.current++; attempted.current = '' } }
  }, [accountKey, bridge, config.loading, retryCount, verified])
  useEffect(() => {
    if (!expiresAt || !verified || !bridge) return
    const expires = Date.parse(expiresAt)
    if (!Number.isFinite(expires)) return
    let timer: number
    function expire() {
      const remaining = expires - Date.now()
      if (remaining > 0) { timer = window.setTimeout(expire, Math.min(remaining, 2_147_483_647)); return }
      blocked.current = true; epoch.current++; setVerified(''); setError('登录已过期，请重新登录。'); clearLibraryDrafts()
      void bridge?.platformLogout().then(value => latest.current.apply(value)).catch(() => undefined)
    }
    timer = window.setTimeout(expire, Math.max(0, Math.min(expires - Date.now(), 2_147_483_647)))
    return () => window.clearTimeout(timer)
  }, [bridge, expiresAt, verified])
  useEffect(() => bridge?.onEvent(event => {
    if (event.kind === 'session-ended' || event.kind === 'session-paused') {
      blocked.current = true; epoch.current++; setVerified(''); setChecking(false); setError(event.message); clearLibraryDrafts()
    }
    if (event.kind === 'session-restored') { blocked.current = false; attempted.current = ''; setError(''); setRetryCount(value => value + 1) }
  }), [bridge])
  async function logout() {
    blocked.current = true; epoch.current++; setVerified(''); setChecking(true); setError(''); clearLibraryDrafts()
    try { if (bridge) latest.current.apply(await bridge.platformLogout()) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { clearLibraryDrafts(); setChecking(false) }
  }
  function retry() { blocked.current = false; attempted.current = ''; setRetryCount(value => value + 1) }
  return { ready: Boolean(accountKey && verified === accountKey), accountKey, checking, error, accept, logout, retry }
}
