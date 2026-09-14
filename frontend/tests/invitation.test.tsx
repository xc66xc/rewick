// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { DesktopBridge } from '../src/shared/types'
import InvitationField from '../src/renderer/src/components/invitation/InvitationField'
import InviteFriendsButton from '../src/renderer/src/components/invitation/InviteFriendsButton'
import { registerInputSchema, passwordResetInputSchema } from '../src/main/services/platform-schema'

afterEach(cleanup)
const summary = { code: 'ABC234', enabled: true, rewardSeconds: 600, invitedCount: 2, rewardedSeconds: 1200 }
function bridge(enabled = true) {
  return { invitationSettings: vi.fn(async () => ({ enabled, rewardSeconds: 600, version: 0 })), invitationCreateCode: vi.fn(async () => summary) } as unknown as DesktopBridge
}
it('shows an optional uppercase code only when invitations are enabled', async () => {
  const api = bridge()
  function Field() { const [value, setValue] = useState(''); return <InvitationField bridge={api} value={value} onChange={setValue} /> }
  render(<Field />)
  const input = await screen.findByLabelText('邀请码（选填）')
  await userEvent.setup().type(input, 'abc234')
  expect(input).toHaveProperty('value', 'ABC234')
  expect(input).toHaveProperty('required', false)
})
it('hides the invitation field when disabled and clears stale input', async () => {
  const onChange = vi.fn()
  render(<InvitationField bridge={bridge(false)} value="ABC234" onChange={onChange} />)
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(''))
  expect(screen.queryByLabelText('邀请码（选填）')).toBeNull()
})
it('creates the code only on opening and shows reward statistics', async () => {
  const api = bridge()
  render(<InviteFriendsButton bridge={api} />)
  const button = await screen.findByRole('button', { name: '邀请好友' })
  expect(api.invitationCreateCode).not.toHaveBeenCalled()
  await userEvent.setup().click(button)
  expect(await screen.findByRole('dialog', { name: '邀请好友' })).toBeTruthy()
  expect(screen.getByLabelText('我的邀请码')).toHaveProperty('value', 'ABC234')
  expect(screen.getByText(/成功邀请 2 人/)).toBeTruthy()
})
it('keeps reset independent and normalizes optional registration codes', () => {
  const credentials = { email: 'alice@example.com', password: 'safe-password-123', code: '123456' }
  expect(registerInputSchema.parse(credentials).invitationCode).toBeUndefined()
  expect(registerInputSchema.parse({ ...credentials, invitationCode: 'abc234' }).invitationCode).toBe('ABC234')
  expect(passwordResetInputSchema.parse(credentials)).toEqual(credentials)
  expect(registerInputSchema.safeParse({ ...credentials, invitationCode: 'abc' }).success).toBe(false)
})
