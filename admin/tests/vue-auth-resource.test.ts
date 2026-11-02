import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { ApiClient } from '../src/api'
import { useAuth } from '../src/composables/auth'
import { useResource } from '../src/composables/useResource'
import { response } from './fixtures'

const AuthConsumer = defineComponent({
  setup() {
    const auth = useAuth()
    return () => h('section', [
      h('p', { role: 'status' }, auth.checking.value ? '正在验证管理会话' : auth.session.value ? `已登录 ${auth.session.value.admin.displayName}` : '需要登录'),
      auth.error.value ? h('p', { role: 'alert' }, auth.error.value) : null,
      h('button', { disabled: auth.busy.value, onClick: () => auth.login('admin', 'synthetic-password') }, '登录'),
      h('button', { onClick: () => auth.logout() }, '退出'),
      h('button', { disabled: !auth.session.value, onClick: () => auth.session.value?.api.request('/admin/test-read', z.object({ ok: z.boolean() })).catch(() => undefined) }, '读取受保护数据')
    ])
  }
})
const savedSession = () => sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'synthetic-tab-token', expiresAt: '2099-01-01T00:00:00Z' }))

describe('Vue administrator session compatibility', () => {
  it('revalidates a restored tab before exposing an authenticated administrator', async () => {
    savedSession()
    const paths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      paths.push(url)
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer synthetic-tab-token')
      return response({ id: '1', displayName: '管理者', role: 'ADMIN' })
    }))
    render(AuthConsumer)
    await screen.findByText('已登录 管理者')
    expect(paths).toEqual(['/api/v1/admin/me'])
    expect(localStorage.length).toBe(0)
  })
  it('uses the unchanged login payload and verifies ADMIN before accepting credentials', async () => {
    const actor = userEvent.setup(), calls: { url: string; method: string; body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      calls.push({ url, method: options.method ?? 'GET', body: options.body ? JSON.parse(String(options.body)) : null })
      if (url.endsWith('/auth/login')) return response({ accessToken: 'synthetic-new-token', expiresAt: '2099-01-01T00:00:00Z', user: { id: '1', displayName: '管理者' } })
      return response({ id: '1', displayName: '管理者', role: 'ADMIN' })
    }))
    render(AuthConsumer)
    await actor.click(await screen.findByRole('button', { name: '登录' }))
    await screen.findByText('已登录 管理者')
    expect(calls).toEqual([
      { url: '/api/v1/auth/login', method: 'POST', body: { identifier: 'admin', password: 'synthetic-password', clientType: 'admin' } },
      { url: '/api/v1/admin/me', method: 'GET', body: null }
    ])
    expect(sessionStorage.getItem('copilot.admin.session')).toContain('synthetic-new-token')
    expect(sessionStorage.getItem('copilot.admin.session')).not.toContain('password')
  })
  it('rejects non-admin credentials, revokes the candidate session, and leaves protected actions unavailable', async () => {
    const actor = userEvent.setup(), paths: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      paths.push(url)
      if (url.endsWith('/auth/login')) return response({ accessToken: 'candidate', expiresAt: '2099-01-01T00:00:00Z', user: { id: '3', displayName: 'candidate' } })
      if (url.endsWith('/admin/me')) return response({ id: '3', displayName: 'candidate', role: 'USER' })
      return new Response(null, { status: 204 })
    }))
    render(AuthConsumer)
    await actor.click(await screen.findByRole('button', { name: '登录' }))
    expect((await screen.findByRole('alert')).textContent).toContain('没有管理权限')
    await waitFor(() => expect(paths).toContain('/api/v1/auth/logout'))
    expect(screen.getByRole('button', { name: '读取受保护数据' })).toHaveProperty('disabled', true)
    expect(sessionStorage.length).toBe(0)
  })
  it('clears revoked stored credentials and never loads a protected business endpoint', async () => {
    savedSession()
    const fetcher = vi.fn(async () => response({ message: 'expired' }, 401))
    vi.stubGlobal('fetch', fetcher)
    render(AuthConsumer)
    await screen.findByRole('alert')
    expect(sessionStorage.length).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('expires an active session on a protected 401 and preserves only appearance preferences on logout', async () => {
    savedSession(); localStorage.setItem('rewick.admin.appearance', JSON.stringify({ theme: 'dark' }))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/admin/me') ? response({ id: '1', displayName: '管理者', role: 'ADMIN' }) : response({ message: 'expired' }, 401)))
    render(AuthConsumer)
    await screen.findByText('已登录 管理者')
    await userEvent.setup().click(screen.getByRole('button', { name: '读取受保护数据' }))
    await screen.findByText('需要登录')
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.getItem('rewick.admin.appearance')).toContain('dark')
  })
  it('revokes the same credential on explicit logout without changing appearance', async () => {
    savedSession(); localStorage.setItem('rewick.admin.appearance', 'synthetic-preference')
    const calls: { url: string; token: string | undefined; body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      calls.push({ url, token: (options.headers as Record<string, string>).Authorization, body: options.body ? JSON.parse(String(options.body)) : null })
      return url.endsWith('/admin/me') ? response({ id: '1', displayName: '管理者', role: 'ADMIN' }) : new Response(null, { status: 204 })
    }))
    render(AuthConsumer)
    await screen.findByText('已登录 管理者')
    await userEvent.setup().click(screen.getByRole('button', { name: '退出' }))
    await waitFor(() => expect(calls).toContainEqual({ url: '/api/v1/auth/logout', token: 'Bearer synthetic-tab-token', body: {} }))
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.getItem('rewick.admin.appearance')).toBe('synthetic-preference')
  })
})

describe('Vue cancellable resource compatibility', () => {
  it('aborts stale queries and never renders an older query response over a newer one', async () => {
    const requests: { path: string; signal: AbortSignal; resolve: (response: Response) => void }[] = []
    vi.stubGlobal('fetch', vi.fn((path: string, options: RequestInit) => new Promise<Response>(resolve => requests.push({ path, signal: options.signal as AbortSignal, resolve }))))
    const Consumer = defineComponent({ setup() {
      const query = ref('old')
      const resource = useResource(new ApiClient('synthetic'), () => `/admin/users?query=${query.value}&page=1&size=20`, z.object({ value: z.string() }))
      return () => h('div', [h('button', { onClick: () => { query.value = 'new' } }, '切换查询'), h('p', { role: 'status' }, resource.state.value.kind === 'ready' ? resource.state.value.data.value : resource.state.value.kind)])
    } })
    render(Consumer)
    await userEvent.setup().click(screen.getByRole('button', { name: '切换查询' }))
    expect(requests[0].signal.aborted).toBe(true)
    requests[1].resolve(response({ value: '新查询结果' }))
    await screen.findByText('新查询结果')
    requests[0].resolve(response({ value: '过期结果' }))
    await waitFor(() => expect(screen.queryByText('过期结果')).toBeNull())
  })
  it('cancels the active request when its view unmounts', () => {
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => { requestSignal = options.signal as AbortSignal; return new Promise<Response>(() => undefined) }))
    const Consumer = defineComponent({ setup() { useResource(new ApiClient('synthetic'), '/admin/users', z.object({ ok: z.boolean() })); return () => h('p', '加载中') } })
    const component = render(Consumer)
    component.unmount()
    expect(requestSignal?.aborted).toBe(true)
  })
})
