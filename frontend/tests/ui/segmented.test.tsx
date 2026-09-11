// @vitest-environment jsdom
import './setup-dom'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from '../../src/renderer/src/components/ui/segmented'

afterEach(() => cleanup())

const options = [
  { value: 'system', label: '系统音频' },
  { value: 'mic', label: '麦克风' },
]

describe('Segmented 分段单选', () => {
  it('当前值带 data-pressed,点击其它项回调新值', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Segmented value="system" onValueChange={onValueChange} options={options} aria-label="音源" />)
    expect(screen.getByRole('button', { name: '系统音频' }).hasAttribute('data-pressed')).toBe(true)
    expect(screen.getByRole('button', { name: '麦克风' }).hasAttribute('data-pressed')).toBe(false)
    await user.click(screen.getByRole('button', { name: '麦克风' }))
    expect(onValueChange).toHaveBeenCalledWith('mic')
  })

  it('受控切换后 pressed 态跟随新值', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState('system')
      return (
        <Segmented
          value={value}
          onValueChange={(next) => setValue(next)}
          options={options}
          aria-label="音源"
        />
      )
    }
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '麦克风' }))
    expect(screen.getByRole('button', { name: '麦克风' }).hasAttribute('data-pressed')).toBe(true)
    expect(screen.getByRole('button', { name: '系统音频' }).hasAttribute('data-pressed')).toBe(false)
  })
})
