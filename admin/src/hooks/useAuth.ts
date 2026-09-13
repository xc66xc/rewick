import { useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, message } from '../api'
import { adminSchema, loginSchema, type Admin } from '../types'
import { clearSession, readSession, saveSession } from './admin-session'
interface Session { api: ApiClient; admin: Admin; expiresAt: string }
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const active = useRef<ApiClient | null>(null)
  function expire() {
    clearSession(); active.current?.dispose(); active.current = null
    setSession(null); setError('登录已失效，请重新登录。')
  }
  useEffect(() => () => active.current?.dispose(), [])
  useEffect(() => {
    let disposed = false
    const saved = readSession()
    if (!saved) { setChecking(false); return }
    const client = new ApiClient(saved.accessToken)
    active.current = client
    void client.request('/admin/me', adminSchema).then(admin => {
      if (disposed) return
      if (admin.role !== 'ADMIN') throw new ApiError('此账号没有管理权限。', 403)
      const authenticated = new ApiClient(saved.accessToken, expire)
      client.dispose(); active.current = authenticated
      setSession({ api: authenticated, admin, expiresAt: saved.expiresAt })
    }).catch(reason => {
      if (disposed) return
      if (reason instanceof ApiError && [401, 403].includes(reason.status)) clearSession()
      client.dispose(); active.current = null; setError(message(reason))
    }).finally(() => { if (!disposed) setChecking(false) })
    return () => { disposed = true; active.current?.dispose() }
  }, []) // Revalidate the tab credential once per application mount.
  useEffect(() => {
    if (!session) return
    const check = () => { if (Date.parse(session.expiresAt) <= Date.now()) expire() }
    check()
    const timer = window.setInterval(check, 1000)
    return () => window.clearInterval(timer)
  }, [session])
  async function login(identifier: string, password: string) {
    setBusy(true); setError('')
    const guest = new ApiClient()
    let candidate: ApiClient | undefined
    try {
      const result = await guest.request('/auth/login', loginSchema, { method: 'POST', body: { identifier, password, clientType: 'admin' } })
      if (!(Date.parse(result.expiresAt) > Date.now())) throw new Error('登录凭证已过期，请重新登录。')
      candidate = new ApiClient(result.accessToken, expire)
      const admin = await candidate.request('/admin/me', adminSchema)
      if (admin.role !== 'ADMIN') throw new Error('此账号没有管理权限，请使用管理员账号登录。')
      saveSession(result)
      active.current?.dispose(); active.current = candidate
      setSession({ api: candidate, admin, expiresAt: result.expiresAt }); candidate = undefined
    } catch (reason) { setError(message(reason)); if (candidate) { void candidate.logout() } }
    finally { guest.dispose(); setBusy(false) }
  }
  async function logout() {
    const client = active.current
    clearSession(); active.current = null; setSession(null); setError('')
    if (client) await client.logout()
  }
  return { session, error, busy, checking, login, logout }
}
