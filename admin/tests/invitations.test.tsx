import { expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InvitationsPage from '../src/pages/InvitationsPage'
import { ApiClient } from '../src/api'
import { data, page, response } from './fixtures'
it('saves reward rules and lists identifiable inviter and invitee emails', async () => {
  const updates: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (options.method === 'PUT') { updates.push(data(options)); return response({ ...data(options), version: 2 }) }
    if (url.includes('invitation-settings')) return response({ enabled: false, rewardSeconds: 600, version: 1 })
    return response(page([{ id: '1', inviterName: 'Alice', inviterEmail: 'alice@example.com', inviteeName: 'Bob', inviteeEmail: 'bob@example.com', code: 'ABC234', rewardSeconds: 600, createdAt: '2026-09-14T04:00:00Z' }]))
  }))
  render(<InvitationsPage api={new ApiClient('token')} />)
  const actor = userEvent.setup()
  await actor.click(await screen.findByRole('button', { name: '修改规则' }))
  await actor.click(await screen.findByLabelText('启用邀请奖励'))
  await actor.click(screen.getByRole('button', { name: '保存奖励配置' }))
  await screen.findByText('邀请奖励配置已保存。')
  expect(updates).toEqual([{ enabled: true, rewardSeconds: 600, version: 1 }])
  expect(screen.getByText('alice@example.com')).toBeTruthy()
  expect(screen.getByText('bob@example.com')).toBeTruthy()
})
it('retains the draft after a configuration conflict', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => options.method === 'PUT' ? response({ code: 'invitation_settings_conflict' }, 409) : url.includes('invitation-settings') ? response({ enabled: false, rewardSeconds: 600, version: 1 }) : response(page([]))))
  render(<InvitationsPage api={new ApiClient('token')} />)
  const actor = userEvent.setup()
  await actor.click(await screen.findByRole('button', { name: '修改规则' }))
  await actor.click(await screen.findByLabelText('启用邀请奖励'))
  await actor.click(screen.getByRole('button', { name: '保存奖励配置' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(screen.getByLabelText('启用邀请奖励')).toHaveProperty('checked', true)
})
it('cancels rule changes without saving', async () => {
  const writes: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (options.method === 'PUT') writes.push(data(options))
    return response(url.includes('invitation-settings') ? { enabled: false, rewardSeconds: 600, version: 1 } : page([]))
  }))
  render(<InvitationsPage api={new ApiClient('token')} />)
  const actor = userEvent.setup()
  await actor.click(await screen.findByRole('button', { name: '修改规则' }))
  await actor.click(screen.getByLabelText('启用邀请奖励'))
  await actor.click(screen.getByRole('button', { name: '取消' }))
  expect(writes).toHaveLength(0)
  expect(screen.getByText('邀请奖励已关闭')).toBeTruthy()
  await actor.click(screen.getByRole('button', { name: '修改规则' }))
  expect(screen.getByLabelText('启用邀请奖励')).toHaveProperty('checked', false)
})
