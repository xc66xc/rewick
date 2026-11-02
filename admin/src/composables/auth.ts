import { onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { ApiClient, ApiError, message } from '../api'
import { adminSchema, loginSchema, type Admin } from '../types'
import { clearSession, readSession, saveSession } from '../hooks/admin-session'
export interface Session { api: ApiClient; admin: Admin; expiresAt: string }
export function useAuth() {
  const session = shallowRef<Session | null>(null)
  const error = ref(''), busy = ref(false), checking = ref(true)
  let active: ApiClient | undefined, disposed = false, expiry: ReturnType<typeof setInterval> | undefined
  function expire() { clearSession(); active?.dispose(); active = undefined; session.value = null; error.value = '登录已失效，请重新登录。' }
  onMounted(async () => {
    const saved = readSession()
    if (!saved) { checking.value = false; return }
    const client = new ApiClient(saved.accessToken); active = client
    try {
      const admin = await client.request('/admin/me', adminSchema)
      if (disposed) return
      if (admin.role !== 'ADMIN') throw new ApiError('此账号没有管理权限。', 403)
      const authenticated = new ApiClient(saved.accessToken, expire)
      client.dispose(); active = authenticated; session.value = { api: authenticated, admin, expiresAt: saved.expiresAt }
    } catch (reason) {
      if (disposed) return
      if (reason instanceof ApiError && [401,403].includes(reason.status)) clearSession()
      client.dispose(); active = undefined; error.value = message(reason)
    } finally { if (!disposed) checking.value = false }
  })
  watch(session, value => {
    clearInterval(expiry)
    if (!value) return
    const check = () => { if (Date.parse(value.expiresAt) <= Date.now()) expire() }
    check(); expiry = setInterval(check, 1000)
  })
  async function login(identifier: string, password: string) {
    if (busy.value) return
    busy.value = true; error.value = ''
    const guest = new ApiClient(); let candidate: ApiClient | undefined
    try {
      const result = await guest.request('/auth/login', loginSchema, { method: 'POST', body: { identifier, password, clientType: 'admin' } })
      if (!(Date.parse(result.expiresAt) > Date.now())) throw new Error('登录凭证已过期，请重新登录。')
      candidate = new ApiClient(result.accessToken, expire)
      const admin = await candidate.request('/admin/me', adminSchema)
      if (disposed) { void candidate.logout(); return }
      if (admin.role !== 'ADMIN') throw new Error('此账号没有管理权限，请使用管理员账号登录。')
      saveSession(result); active?.dispose(); active = candidate; session.value = { api: candidate, admin, expiresAt: result.expiresAt }; candidate = undefined
    } catch (reason) { if (!disposed) error.value = message(reason); if (candidate) void candidate.logout() }
    finally { guest.dispose(); if (!disposed) busy.value = false }
  }
  async function logout() { const client = active; clearSession(); active = undefined; session.value = null; error.value = ''; if (client) await client.logout() }
  onScopeDispose(() => { disposed = true; active?.dispose(); clearInterval(expiry) })
  return { session, error, busy, checking, login, logout }
}
