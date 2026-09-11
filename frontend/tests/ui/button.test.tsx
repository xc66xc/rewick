// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Button,
  IconButton,
  LinkButton,
  TextButton,
  buttonDangerClass,
} from '../../src/renderer/src/components/ui/button'

afterEach(() => cleanup())

describe('Button 按钮族', () => {
  it('默认渲染 default 变体 + md 尺寸,type 为 button', () => {
    render(<Button>保存</Button>)
    const btn = screen.getByRole('button', { name: '保存' })
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.className).toContain('bg-card')
    expect(btn.className).toContain('border-border-strong')
    expect(btn.className).toContain('min-h-9')
  })

  it('primary 变体应用 accent 底色与白字', () => {
    render(<Button variant="primary">生成回答</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-accent')
    expect(btn.className).toContain('text-text-on-fill')
  })

  it('disabled 阻止点击,恢复后可点击', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(
      <Button onClick={onClick} disabled>
        保存
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn.hasAttribute('disabled')).toBe(true)
    await user.click(btn)
    expect(onClick).not.toHaveBeenCalled()

    rerender(<Button onClick={onClick}>保存</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('图标/链接/文字按钮与危险态类', () => {
    expect(buttonDangerClass).toContain('hover:text-danger')
    render(
      <>
        <IconButton aria-label="置顶" />
        <LinkButton>查看回答</LinkButton>
        <TextButton>删除</TextButton>
      </>,
    )
    expect(screen.getByRole('button', { name: '置顶' }).className).toContain('size-9')
    expect(screen.getByRole('button', { name: '查看回答' }).className).toContain('text-accent-text')
    expect(screen.getByRole('button', { name: '删除' }).className).toContain('hover:text-danger')
  })
})
