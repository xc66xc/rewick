import { useEffect, useRef, useState } from 'react'
import { ApiClient, message } from '../api'
import { adminSchema, loginSchema, type Admin } from '../types'
interface Session { api: ApiClient; admin: Admin }
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef<ApiClient | null>(null)
  useEffect(() => () => active.current?.dispose(), []) // Credentials live only for this application mount.
  async function login(username: string, password: string) {
    setBusy(true); setError('')
    const guest = new ApiClient()
    let candidate: ApiClient | undefined
    try {
      const result = await guest.request('/auth/login', loginSchema, { method: 'POST', body: { username, password } })
      candidate = new ApiClient(result.accessToken, () => { setSession(null); setError('登录已失效，请重新登录。') })
      const admin = await candidate.request('/admin/me', adminSchema)
      if (admin.role !== 'ADMIN') throw new Error('此账号没有管理权限，请使用管理员账号登录。')
      active.current?.dispose(); active.current = candidate; setSession({ api: candidate, admin }); candidate = undefined
    } catch (reason) { setError(message(reason)); if (candidate) { void candidate.logout() } }
    finally { guest.dispose(); setBusy(false) }
  }
  async function logout() {
    const client = active.current
    active.current = null; setSession(null); setError('')
    if (client) await client.logout()
  }
  return { session, error, busy, login, logout }
}
