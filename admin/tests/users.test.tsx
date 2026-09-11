import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import UsersPage from '../src/pages/UsersPage'
import { data, page, response, user } from './fixtures'
describe('user management', () => {
  it('retains non-secret create fields after failure and retries with a new password', async () => {
    let failed = false
    const created: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { if (options.method === 'POST') { created.push(data(options)); if (!failed) { failed = true; return response({ message: '登录账号暂不可用' }, 409) } return response({ ...user, displayName: 'new-user' }) } return response(page([user])) }))
    const actor = userEvent.setup(); render(<UsersPage api={new ApiClient('token')} />)
    await screen.findByText('candidate'); await actor.click(screen.getByRole('button', { name: '创建用户' }))
    const dialog = screen.getByRole('dialog', { name: '创建用户' })
    await actor.type(within(dialog).getByLabelText('登录账号'), 'new-user'); await actor.type(within(dialog).getByLabelText('初始密码'), 'first-password-123')
    await actor.clear(within(dialog).getByLabelText('小时')); await actor.type(within(dialog).getByLabelText('小时'), '0')
    await actor.click(within(dialog).getByRole('button', { name: '创建用户' }))
    await within(dialog).findByRole('alert')
    expect(within(dialog).getByLabelText('登录账号')).toHaveProperty('value', 'new-user')
    expect(within(dialog).getByLabelText('初始密码')).toHaveProperty('value', '')
    await actor.type(within(dialog).getByLabelText('初始密码'), 'second-password-123'); await actor.click(within(dialog).getByRole('button', { name: '创建用户' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(created).toHaveLength(2); expect(created[1]).toMatchObject({ identifier: 'new-user', password: 'second-password-123', availableSeconds: 0 })
  })
  it('requires explicit confirmation to disable a user without changing the time balance', async () => {
    const updates: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { if (options.method === 'PUT') { updates.push(data(options)); return response({ ...user, ...data(options) }) } return response(page([user])) }))
    const actor = userEvent.setup(); render(<UsersPage api={new ApiClient('token')} />)
    await actor.click(await screen.findByRole('button', { name: '编辑 candidate' }))
    const dialog = screen.getByRole('dialog', { name: '编辑用户 · candidate' })
    await actor.click(within(dialog).getByLabelText('启用账号'))
    await actor.click(within(dialog).getByRole('button', { name: '保存用户' }))
    expect(updates).toHaveLength(0)
    const confirm = screen.getByRole('dialog', { name: '停用 candidate' })
    await actor.click(within(confirm).getByRole('button', { name: '确认停用' }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toMatchObject({ enabled: false })
  })
  it('searches and paginates via the server, and cancelling token revocation sends no mutation', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => { calls.push(`${options.method} ${url}`); return response(page([user], 21, url.includes('page=2') ? 2 : 1)) }))
    const actor = userEvent.setup(); render(<UsersPage api={new ApiClient('token')} />)
    await screen.findByText('candidate'); await actor.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(calls.some(value => value.includes('page=2'))).toBe(true))
    await actor.type(screen.getByLabelText('邮箱或显示名称'), 'candidate'); await actor.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByRole('button', { name: '撤销登录 candidate' }); await actor.click(screen.getByRole('button', { name: '撤销登录 candidate' }))
    await actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    expect(calls.some(value => value.startsWith('POST'))).toBe(false)
    expect(calls.some(value => value.includes('query=candidate&page=1'))).toBe(true)
  })
})
