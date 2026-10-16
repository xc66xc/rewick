// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SourceShortcutPreferences from '../src/renderer/src/components/SourceShortcutPreferences'
import type { DesktopBridge } from '../src/shared/types'
afterEach(cleanup)
async function setup(initial = '', save = vi.fn(async (value: { accelerator: string }) => value)) {
  const bridge = { getSourceShortcut: async () => ({ accelerator: initial }), saveSourceShortcut: save } as unknown as DesktopBridge
  const user = userEvent.setup()
  render(<SourceShortcutPreferences bridge={bridge} />)
  const field = screen.getByRole('textbox', { name: '切换系统音频 / 麦克风' }) as HTMLInputElement
  await waitFor(() => expect(field.disabled).toBe(false))
  return { user, field, save }
}
describe('single-field shortcut recorder', () => {
  it('records Cmd+3 and saves once after all keys are released without any buttons', async () => {
    const { user, field, save } = await setup()
    expect(screen.queryByRole('button')).toBeNull()
    await user.click(field)
    await user.keyboard('{Meta>}[Digit3]')
    expect(field.value).toMatch(/^(Cmd|Ctrl)\+3$/)
    expect(save).not.toHaveBeenCalled()
    await user.keyboard('{/Meta}')
    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ accelerator: 'CommandOrControl+3' }))
    await screen.findByText('已生效 · 点击录制，自动保存；仅在本机生效。')
    expect(document.activeElement).not.toBe(field)
  })
  it.each(['Backspace', 'Delete'])('clears and disables with %s', async key => {
    const { user, field, save } = await setup('Alt+Q')
    await user.click(field)
    await user.keyboard(`{${key}}`)
    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ accelerator: '' }))
    await screen.findByText('未设置 · 点击录制，自动保存；仅在本机生效。')
  })
  it('restores the existing shortcut on Escape or Tab without saving', async () => {
    const { user, field, save } = await setup('Alt+Q')
    await user.click(field)
    await user.keyboard('{Escape}')
    expect(field.value).toBe('Alt+Q')
    await user.click(field)
    await user.keyboard('{Control>}[Digit3]')
    await user.tab()
    await user.keyboard('{/Control}')
    expect(field.value).toBe('Alt+Q')
    expect(save).not.toHaveBeenCalled()
  })
  it('rejects bare keys and reserved chords, then accepts a valid Windows chord', async () => {
    const { user, field, save } = await setup('Alt+Q')
    await user.click(field)
    await user.keyboard('q')
    await screen.findByText('请按 Cmd/Ctrl 或 Alt 加字母、数字等组合键。')
    await user.keyboard('{Control>}{Shift>}[KeyR]{/Shift}{/Control}')
    await screen.findByText('该组合已用于恢复窗口或生成回答，请换一个快捷键。')
    expect(save).not.toHaveBeenCalled()
    await user.keyboard('{Control>}{Alt>}[KeyW]{/Alt}{/Control}')
    await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ accelerator: 'CommandOrControl+Alt+W' }))
  })
  it('preserves the original shortcut when registration fails and allows retry', async () => {
    const save = vi.fn(async (value: { accelerator: string }) => value)
    save.mockRejectedValueOnce(new Error('快捷键已被占用'))
    const { user, field } = await setup('Alt+Q', save)
    await user.click(field)
    await user.keyboard('{Meta>}[Digit3]{/Meta}')
    await screen.findByText('快捷键已被占用')
    expect(field.value).toBe('Alt+Q')
    await user.click(field)
    await user.keyboard('{Meta>}[Digit4]{/Meta}')
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ accelerator: 'CommandOrControl+4' }))
    await screen.findByText('已生效 · 点击录制，自动保存；仅在本机生效。')
  })
})
