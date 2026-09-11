// @vitest-environment jsdom
import './setup-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToggleSwitch } from '../../src/renderer/src/components/ui/switch'

afterEach(() => cleanup())

describe('ToggleSwitch 开关', () => {
  it('渲染 switch 角色与说明文字,点击触发 onCheckedChange(true)', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<ToggleSwitch checked={false} onCheckedChange={onCheckedChange} label="自动回答" />)
    const control = screen.getByRole('switch')
    expect(control.hasAttribute('data-checked')).toBe(false)
    expect(screen.getByText('自动回答')).toBeTruthy()
    await user.click(control)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('受控选中态带 data-checked,再次点击回调 false', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    const { rerender } = render(
      <ToggleSwitch checked onCheckedChange={onCheckedChange} label="使用参考资料" />,
    )
    const control = screen.getByRole('switch')
    expect(control.hasAttribute('data-checked')).toBe(true)
    await user.click(control)
    expect(onCheckedChange).toHaveBeenCalledWith(false)
    rerender(<ToggleSwitch checked={false} onCheckedChange={onCheckedChange} label="使用参考资料" />)
    expect(screen.getByRole('switch').hasAttribute('data-checked')).toBe(false)
  })

  it('sm 规格与禁用态', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<ToggleSwitch size="sm" disabled onCheckedChange={onCheckedChange} aria-label="系统音频自动回答" />)
    const control = screen.getByRole('switch')
    expect(control.className).toContain('w-8')
    expect(control.hasAttribute('data-disabled')).toBe(true)
    await user.click(control)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
