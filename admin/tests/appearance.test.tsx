import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { appearanceKey } from '../src/appearance'
import { page, response, user } from './fixtures'
function media() {
  const dark = new EventTarget() as EventTarget & { matches: boolean }
  const reduced = new EventTarget() as EventTarget & { matches: boolean }
  dark.matches = false; reduced.matches = false
  vi.stubGlobal('matchMedia', vi.fn((query: string) => query.includes('color-scheme') ? dark : reduced))
  return { dark, reduced }
}
function loggedIn() {
  sessionStorage.setItem('copilot.admin.session', JSON.stringify({ accessToken: 'fixture-token', expiresAt: '2099-01-01T00:00:00Z' }))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/admin/me')) return response({ id: '1', displayName: '测试管理员', role: 'ADMIN' })
    if (url.includes('mock-wallet')) return response({ availableSeconds: 600, walletVersion: 1 })
    return response(page([user]))
  }))
}
beforeEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.density; delete document.documentElement.dataset.motion })
afterEach(() => { delete document.documentElement.dataset.pageHidden })
describe('administrator appearance', () => {
  it('applies and persists theme and density without replacing an unfinished form', async () => {
    media(); loggedIn(); render(<App />)
    await screen.findByRole('heading', { name: '用户管理', level: 2 })
    const actor = userEvent.setup()
    await actor.type(screen.getByLabelText('邮箱或显示名称'), '未提交搜索')
    const requests = vi.mocked(fetch).mock.calls.length
    await actor.click(screen.getByRole('button', { name: '外观设置' }))
    await actor.click(screen.getByRole('radio', { name: '深色' }))
    await actor.click(screen.getByRole('radio', { name: /紧凑/ }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(JSON.parse(localStorage.getItem(appearanceKey) ?? '{}')).toEqual({ theme: 'dark', density: 'compact', motion: true })
    await actor.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.getByLabelText('邮箱或显示名称')).toHaveProperty('value', '未提交搜索')
    expect(vi.mocked(fetch).mock.calls.length).toBe(requests)
    await actor.click(screen.getByRole('button', { name: '退出登录' }))
    expect(localStorage.getItem(appearanceKey)).toContain('dark')
  })
  it('follows system theme and respects system reduced motion even when motion is enabled', async () => {
    const { dark, reduced } = media()
    render(<App />)
    await screen.findByRole('heading', { name: '登录管理后台' })
    dark.matches = true; dark.dispatchEvent(new Event('change'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    reduced.matches = true; reduced.dispatchEvent(new Event('change'))
    await waitFor(() => expect(document.documentElement.dataset.motion).toBe('reduced'))
    const actor = userEvent.setup()
    await actor.click(screen.getByRole('button', { name: '外观设置' }))
    await actor.click(screen.getByRole('radio', { name: '浅色' }))
    dark.matches = false; dark.dispatchEvent(new Event('change'))
    dark.matches = true; dark.dispatchEvent(new Event('change'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.motion).toBe('reduced')
  })
  it('restores saved preferences and allows reducing motion locally', async () => {
    media()
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: 'dark', density: 'comfortable', motion: false }))
    render(<App />)
    await screen.findByRole('heading', { name: '登录管理后台' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.density).toBe('comfortable')
    expect(document.documentElement.dataset.motion).toBe('reduced')
  })
  it('keeps login usable when preferences are malformed or storage is unavailable', async () => {
    media(); localStorage.setItem(appearanceKey, '{broken')
    render(<App />)
    await screen.findByRole('heading', { name: '登录管理后台' })
    expect(document.documentElement.dataset.theme).toBe('light')
    const actor = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    await actor.click(screen.getByRole('button', { name: '外观设置' }))
    await actor.click(screen.getByRole('radio', { name: '深色' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '浏览器未允许保存外观偏好，本次设置仍然有效。')
    expect(document.documentElement.dataset.theme).toBe('dark')
    await actor.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.getByLabelText('管理员账号')).toBeTruthy()
  })
  it('synchronizes appearance across tabs without touching administrator credentials', async () => {
    media(); loggedIn(); render(<App />)
    await screen.findByRole('heading', { name: '用户管理', level: 2 })
    localStorage.setItem(appearanceKey, JSON.stringify({ theme: 'dark', density: 'compact', motion: false }))
    window.dispatchEvent(new StorageEvent('storage', { key: appearanceKey }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(sessionStorage.getItem('copilot.admin.session')).toContain('fixture-token')
  })
  it('keeps all navigation actions labelled after collapsing the rail', async () => {
    media(); loggedIn(); render(<App />)
    await screen.findByRole('heading', { name: '用户管理', level: 2 })
    const actor = userEvent.setup()
    await actor.click(screen.getByRole('button', { name: '折叠导航' }))
    expect(screen.getByRole('button', { name: '展开导航' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: '用户管理' }).getAttribute('title')).toBe('用户管理')
    await actor.click(screen.getByRole('button', { name: '打开管理菜单' }))
    expect(screen.getByRole('dialog', { name: '管理菜单' })).toBeTruthy()
    await actor.click(screen.getByRole('button', { name: '关闭管理菜单' }))
    expect(screen.queryByRole('dialog', { name: '管理菜单' })).toBeNull()
  })
})
