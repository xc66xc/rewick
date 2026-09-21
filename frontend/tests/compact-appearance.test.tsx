// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompactAppearance from '../src/renderer/src/components/CompactAppearance'
import { defaultWindowPreferences, windowPreferencesSchema } from '../src/shared/window-preferences'

afterEach(cleanup)
it('changes background opacity with a separate protection toggle', async () => {
  const change = vi.fn()
  const preview = vi.fn()
  const user = userEvent.setup()
  const { rerender } = render(<CompactAppearance preferences={defaultWindowPreferences} saving={false} onChange={change} onPreview={preview} />)
  await user.click(screen.getByRole('button', { name: '透明与共享设置' }))
  expect(screen.getByText('共享保护已开启（尽力保护）')).toBeTruthy()
  const slider = screen.getByRole('slider', { name: '背景不透明度' })
  fireEvent.change(slider, { target: { value: '35' } })
  expect(preview).toHaveBeenLastCalledWith(35)
  expect(change).not.toHaveBeenCalled()
  rerender(<CompactAppearance preferences={{ ...defaultWindowPreferences, backgroundOpacity: 35 }} saving={false} onChange={change} onPreview={preview} />)
  fireEvent.pointerUp(slider)
  expect(change).toHaveBeenLastCalledWith({ backgroundOpacity: 35, contentProtection: true })
  await user.click(screen.getByRole('switch', { name: '共享保护' }))
  expect(change).toHaveBeenLastCalledWith({ backgroundOpacity: 35, contentProtection: false })
})
it('rejects invalid native preference payloads', () => {
  for (const backgroundOpacity of [-1, 81, 35.5, NaN]) expect(windowPreferencesSchema.safeParse({ backgroundOpacity, contentProtection: true }).success).toBe(false)
  expect(windowPreferencesSchema.safeParse({ ...defaultWindowPreferences, arbitrary: true }).success).toBe(false)
})
