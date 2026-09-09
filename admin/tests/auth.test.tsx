import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { page, response, user } from './fixtures'
async function login() { const actor = userEvent.setup(); await actor.type(screen.getByLabelText('管理员账号'), 'admin'); await actor.type(screen.getByLabelText('登录密码'), 'long-password'); await actor.click(screen.getByRole('button', { name: '登录管理后台' })); return actor }
describe('administrator authentication', () => {
  it('rejects non-admin credentials and clears the submitted password', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { requests.push(url); if (url.endsWith('/auth/login')) return response({ accessToken: 'user-token', expiresAt: '2099-01-01T00:00:00Z', user: { id: '2', username: 'candidate' } }); if (url.endsWith('/admin/me')) return response({ message: '需要管理员权限。' }, 403); return new Response(null, { status: 204 }) }))
    render(<App />); await login()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '需要管理员权限。')
    expect(screen.getByLabelText('登录密码')).toHaveProperty('value', '')
    expect(requests).not.toContain('/api/v1/admin/users?query=&page=1&size=20')
  })
  it('restores tab credentials and clears them on 401', async () => {
    const expired = { value: false }
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/auth/login')) return response({ accessToken: 'private-memory-token', expiresAt: '2099-01-01T00:00:00Z', user: { id: '1', username: 'admin' } })
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer private-memory-token')
      if (url.endsWith('/admin/me')) return response({ id: '1', username: 'admin', role: 'ADMIN' })
      if (expired.value) return response({ message: 'expired' }, 401)
      return response(page([user]))
    }))
    render(<App />); const actor = await login()
    await screen.findByRole('heading', { name: '平台用户' })
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(1)
    expired.value = true
    await actor.click(screen.getByRole('button', { name: '调用记录' }))
    await screen.findByRole('heading', { name: '登录管理后台' })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '登录已失效，请重新登录。')
    expect(screen.queryByRole('button', { name: '创建用户' })).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })
  it('restores a refreshed tab only after administrator verification and clears logout', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.endsWith('/auth/login')) return response({ accessToken: 'tab-token', expiresAt: '2099-01-01T00:00:00Z', user: { id: '1', username: 'admin' } })
      if (url.endsWith('/admin/me')) return response({ id: '1', username: 'admin', role: 'ADMIN' })
      return response(page([user]))
    }))
    const first = render(<App />); await login()
    await screen.findByRole('heading', { name: '平台用户' })
    first.unmount(); calls.length = 0
    render(<App />)
    await screen.findByRole('heading', { name: '平台用户' })
    expect(calls[0]).toBe('/api/v1/admin/me')
    expect(calls.some(path => path.endsWith('/auth/login'))).toBe(false)
    expect(sessionStorage.getItem('copilot.admin.session')).not.toContain('long-password')
    await userEvent.setup().click(screen.getByRole('button', { name: '退出登录' }))
    expect(sessionStorage.length).toBe(0)
  })
  it('rejects revoked stored credentials before loading management data', async () => {
    sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'revoked', expiresAt: '2099-01-01T00:00:00Z' }))
    const fetcher = vi.fn(async () => response({ message: 'expired' }, 401))
    vi.stubGlobal('fetch', fetcher)
    render(<App />)
    await screen.findByRole('heading', { name: '登录管理后台' })
    expect(sessionStorage.length).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('reports a wrong password as a credential error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ message: 'bad credentials' }, 401)))
    render(<App />); await login()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('用户名或密码错误。'))
  })
})
