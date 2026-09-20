// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompactAppearance from '../src/renderer/src/components/CompactAppearance'
import { defaultWindowPreferences, windowPreferencesSchema } from '../src/shared/window-preferences'

afterEach(cleanup)
it('explains capture limits and changes background only, with a separate protection toggle', async () => {
  const change = vi.fn()
  const user = userEvent.setup()
  render(<CompactAppearance preferences={defaultWindowPreferences} saving={false} onChange={change} />)
  expect(screen.getByText('共享保护已开启（尽力保护）')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: '透明与共享设置' }))
  expect(screen.getByText(/ScreenCaptureKit/)).toBeTruthy()
  await user.click(screen.getByRole('combobox', { name: '背景不透明度' }))
  await user.click(await screen.findByRole('option', { name: '0% · 完全透明' }))
  expect(change).toHaveBeenLastCalledWith({ backgroundOpacity: 0, contentProtection: true })
  await user.click(screen.getByRole('switch', { name: '共享保护' }))
  expect(change).toHaveBeenLastCalledWith({ backgroundOpacity: 35, contentProtection: false })
})
it('rejects invalid native preference payloads', () => {
  for (const backgroundOpacity of [-1, 81, 35.5, NaN]) expect(windowPreferencesSchema.safeParse({ backgroundOpacity, contentProtection: true }).success).toBe(false)
  expect(windowPreferencesSchema.safeParse({ ...defaultWindowPreferences, arbitrary: true }).success).toBe(false)
})
