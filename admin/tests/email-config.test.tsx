import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import type { EmailConfig } from '../src/types'
import EmailConfigPage from '../src/pages/EmailConfigPage'
import App from '../src/App'
import { data, page, response, user } from './fixtures'

const emailConfig: EmailConfig = { version: 3, enabled: true, host: 'smtp.example.invalid', port: 587, username: 'mailer@example.invalid', hasPassword: true, from: 'noreply@example.invalid', startTls: true, ssl: false }
const passwordField = () => screen.getByLabelText(/^SMTP 密码/)

describe('email service configuration', () => {
  it('tests the draft without publishing or emailing, and retains a failed draft for correction', async () => {
    const requests: { method: string; body: Record<string, unknown> }[] = []
    let successful = false
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (!url.endsWith('/test')) return response(emailConfig)
      requests.push({ method: String(options.method), body: data(options) })
      return response({ success: successful, message: successful ? '连接成功' : '连接失败', latencyMs: 8 })
    }))
    const actor = userEvent.setup(); render(<EmailConfigPage api={new ApiClient('token')} />)
    const host = await screen.findByLabelText('SMTP 主机')
    await actor.clear(host); await actor.type(host, 'new.example.invalid')
    await actor.type(passwordField(), ' draft-password ')
    await actor.click(screen.getByRole('button', { name: '测试连接' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '连接失败（8 ms）。配置草稿已保留。')
    expect(host).toHaveProperty('value', 'new.example.invalid')
    expect(passwordField()).toHaveProperty('value', ' draft-password ')
    expect(requests).toEqual([{ method: 'POST', body: { config: { version: 3, enabled: true, host: 'new.example.invalid', port: 587, username: 'mailer@example.invalid', password: ' draft-password ', from: 'noreply@example.invalid', startTls: true, ssl: false } } }])
    successful = true
    await actor.click(screen.getByRole('button', { name: '测试连接' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '连接成功（8 ms）。仅验证连接与认证，未发送邮件，也未保存配置。')
    expect(passwordField()).toHaveProperty('value', ' draft-password ')
  })

  it('does not render response passwords and clears submitted passwords after saving or leaving', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') { writes.push(data(options)); return response({ ...emailConfig, version: 4 }) }
      return response({ ...emailConfig, password: 'must-never-be-read' })
    }))
    const api = new ApiClient('token'); const actor = userEvent.setup(); const view = render(<EmailConfigPage api={api} />)
    await screen.findByLabelText('SMTP 主机')
    expect(passwordField()).toHaveProperty('value', '')
    expect(document.body.innerHTML).not.toContain('must-never-be-read')
    await actor.type(passwordField(), 'new-password')
    await actor.click(screen.getByRole('button', { name: '保存邮件配置' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', '邮件配置版本 4 已保存。')
    expect(writes[0]).toMatchObject({ version: 3, password: 'new-password' })
    expect(writes[0]).not.toHaveProperty('hasPassword')
    expect(passwordField()).toHaveProperty('value', '')
    await actor.type(passwordField(), 'another-password')
    view.rerender(<EmailConfigPage api={api} active={false} />)
    await waitFor(() => expect(passwordField()).toHaveProperty('value', ''))
  })

  it.each(['SMTP 主机', '端口', 'SMTP 用户名'])('requires re-entering the password when %s changes', async label => {
    const fetch = vi.fn(async () => response(emailConfig)); vi.stubGlobal('fetch', fetch)
    const actor = userEvent.setup(); render(<EmailConfigPage api={new ApiClient('token')} />)
    const field = await screen.findByLabelText(label)
    await actor.clear(field); await actor.type(field, label === '端口' ? '465' : 'changed.example.invalid')
    expect(passwordField()).toHaveProperty('required', true)
    await actor.click(screen.getByRole('button', { name: '保存邮件配置' }))
    await actor.click(screen.getByRole('button', { name: '测试连接' }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('explicitly clears authentication when username is blank and keeps TLS choices exclusive', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') { writes.push(data(options)); return response({ ...emailConfig, version: 4, username: '', hasPassword: false, startTls: false, ssl: true }) }
      return response(emailConfig)
    }))
    const actor = userEvent.setup(); render(<EmailConfigPage api={new ApiClient('token')} />)
    await screen.findByLabelText('SMTP 用户名')
    await actor.type(passwordField(), 'discard-this-secret')
    await actor.clear(screen.getByLabelText('SMTP 用户名'))
    expect(passwordField()).toHaveProperty('value', '')
    expect(passwordField()).toHaveProperty('disabled', true)
    expect(screen.getByText('用户名留空表示无需认证，保存时会清除原有密码。')).toBeTruthy()
    await actor.click(screen.getByLabelText('使用 SSL/TLS'))
    expect(screen.getByLabelText('使用 STARTTLS')).toHaveProperty('checked', false)
    await actor.click(screen.getByLabelText('使用 STARTTLS'))
    expect(screen.getByLabelText('使用 SSL/TLS')).toHaveProperty('checked', false)
    await actor.click(screen.getByLabelText('使用 SSL/TLS'))
    await actor.click(screen.getByRole('button', { name: '保存邮件配置' }))
    await screen.findByRole('status')
    expect(writes[0]).toMatchObject({ username: '', startTls: false, ssl: true })
    expect(writes[0]).not.toHaveProperty('password')
  })

  it('retains a conflicted draft until the administrator confirms reloading', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => options.method === 'PUT' ? response({ message: '邮件配置版本冲突' }, 409) : response(emailConfig)))
    const actor = userEvent.setup(); render(<EmailConfigPage api={new ApiClient('token')} />)
    const from = await screen.findByLabelText('发件邮箱')
    await actor.clear(from); await actor.type(from, 'new@example.invalid')
    await actor.type(passwordField(), 'pending-password')
    await actor.click(screen.getByRole('button', { name: '保存邮件配置' }))
    await screen.findByText('邮件配置版本冲突')
    expect(from).toHaveProperty('value', 'new@example.invalid')
    expect(passwordField()).toHaveProperty('value', 'pending-password')
    await actor.click(screen.getByRole('button', { name: '重新加载邮件配置' }))
    await actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    expect(from).toHaveProperty('value', 'new@example.invalid')
    await actor.click(screen.getByRole('button', { name: '重新加载邮件配置' }))
    await actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: '丢弃草稿并重新加载' }))
    expect(await screen.findByLabelText('发件邮箱')).toHaveProperty('value', 'noreply@example.invalid')
    expect(passwordField()).toHaveProperty('value', '')
    expect(screen.queryByText('邮件配置版本冲突')).toBeNull()
  })

  it('allows saving an unconfigured disabled service but requires a complete draft to test', async () => {
    const empty = { ...emailConfig, enabled: false, host: '', username: '', hasPassword: false, from: '' }
    const fetch = vi.fn(async (_url: string, options: RequestInit) => response(options.method === 'PUT' ? { ...empty, version: 4 } : empty))
    vi.stubGlobal('fetch', fetch)
    const actor = userEvent.setup(); render(<EmailConfigPage api={new ApiClient('token')} />)
    await screen.findByLabelText('SMTP 主机')
    await actor.click(screen.getByRole('button', { name: '测试连接' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '测试连接前，请填写 SMTP 主机和发件邮箱。')
    expect(fetch).toHaveBeenCalledTimes(1)
    await actor.click(screen.getByRole('button', { name: '保存邮件配置' }))
    await screen.findByRole('status')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('opens from navigation, clears draft passwords on navigation, and handles an expired login', async () => {
    let expired = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) return response({ accessToken: 'memory-token', expiresAt: '2099-01-01T00:00:00Z', user: { id: '1', username: 'admin' } })
      if (url.endsWith('/admin/me')) return response({ id: '1', username: 'admin', role: 'ADMIN' })
      if (expired) return response({ message: 'expired' }, 401)
      return response(url.includes('/email-config') ? emailConfig : page([user]))
    }))
    const actor = userEvent.setup(); render(<App />)
    await actor.type(screen.getByLabelText('管理员账号'), 'admin'); await actor.type(screen.getByLabelText('登录密码'), 'long-password')
    await actor.click(screen.getByRole('button', { name: '登录管理后台' }))
    await actor.click(await screen.findByRole('button', { name: '邮件服务' }))
    const heading = await screen.findByRole('heading', { name: '邮件服务', level: 1 })
    expect(document.activeElement).toBe(heading)
    await screen.findByLabelText('SMTP 主机'); await actor.type(passwordField(), 'ephemeral-password')
    await actor.click(screen.getByRole('button', { name: '用户管理' }))
    await actor.click(screen.getByRole('button', { name: '邮件服务' }))
    expect(passwordField()).toHaveProperty('value', '')
    expired = true
    await actor.click(screen.getByRole('button', { name: '测试连接' }))
    await screen.findByRole('heading', { name: '登录管理后台' })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '登录已失效，请重新登录。')
    expect(screen.queryByRole('button', { name: '邮件服务' })).toBeNull()
  })
})
