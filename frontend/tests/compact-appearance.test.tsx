// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompactAppearance from '../src/renderer/src/components/CompactAppearance'
import { defaultWindowPreferences, windowPreferencesSchema } from '../src/shared/window-preferences'

afterEach(cleanup)
it('previews font size and commits it without changing other preferences', async () => {
  const change = vi.fn()
  const preview = vi.fn()
  const user = userEvent.setup()
  const preferences = { ...defaultWindowPreferences, fontSize: 23 }
  const { rerender } = render(<CompactAppearance preferences={preferences} saving={false} onChange={change} onPreview={vi.fn()} onFontPreview={preview} />)
  await user.click(screen.getByRole('button', { name: '透明与共享设置' }))
  const slider = screen.getByRole('slider', { name: '字体大小' })
  expect((slider as HTMLInputElement).value).toBe('23')
  expect((slider as HTMLInputElement).min).toBe('10')
  expect((slider as HTMLInputElement).max).toBe('28')
  fireEvent.change(slider, { target: { value: '10' } })
  expect(preview).toHaveBeenLastCalledWith(10)
  expect(change).not.toHaveBeenCalled()
  rerender(<CompactAppearance preferences={{ ...preferences, fontSize: 10 }} saving={false} onChange={change} onPreview={vi.fn()} onFontPreview={preview} />)
  fireEvent.pointerUp(slider)
  expect(change).toHaveBeenLastCalledWith({ ...preferences, fontSize: 10 })
})

it('accepts old preferences and rejects out-of-range font sizes', () => {
  expect(windowPreferencesSchema.safeParse(defaultWindowPreferences).success).toBe(true)
  for (const fontSize of [10, 13, 14, 28]) {
    expect(windowPreferencesSchema.safeParse({ ...defaultWindowPreferences, fontSize }).success).toBe(true)
  }
  for (const fontSize of [9, 29, 10.5, NaN]) {
    expect(windowPreferencesSchema.safeParse({ ...defaultWindowPreferences, fontSize }).success).toBe(false)
  }
})
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
