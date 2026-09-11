// @vitest-environment jsdom
/* 2026-09-11 第三轮加固:loading / prefix·suffix / 页签计数 / ConfirmModal / iconTrigger·checked / switch description */
import './setup-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MagnifyingGlass, Trash } from '@phosphor-icons/react'
import { Button } from '../../src/renderer/src/components/ui/button'
import { TextField } from '../../src/renderer/src/components/ui/field'
import { TabBar } from '../../src/renderer/src/components/ui/tabs'
import { ConfirmModal } from '../../src/renderer/src/components/ui/dialog'
import { DropdownMenu } from '../../src/renderer/src/components/ui/menu'
import { ToggleSwitch } from '../../src/renderer/src/components/ui/switch'

afterEach(() => cleanup())

describe('Button loading', () => {
  it('loading 时禁用 + aria-busy + 行首转圈图标,结束后恢复', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Button variant="primary" loading>保存</Button>)
    const button = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.querySelector('svg.animate-spin')).not.toBeNull()

    rerender(<Button variant="primary" loading={false}>保存</Button>)
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(button.querySelector('svg.animate-spin')).toBeNull()
    await user.click(button)
  })

  it('loading 不覆盖显式 disabled', () => {
    render(<Button loading={false} disabled>停用</Button>)
    expect((screen.getByRole('button', { name: '停用' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('TextField prefix / suffix', () => {
  it('prefix 渲染在控件内并让出左内边距', () => {
    render(<TextField placeholder="搜索…" aria-label="搜索" prefix={<MagnifyingGlass />} />)
    const input = screen.getByLabelText('搜索')
    expect(input.className).toContain('pl-9')
    expect(input.previousElementSibling?.querySelector('svg')).not.toBeNull()
  })

  it('suffix 让出右内边距,二者都不传则无包裹层', () => {
    const { rerender } = render(<TextField placeholder="问题" aria-label="问题" suffix={<Trash />} />)
    const input = screen.getByLabelText('问题')
    expect(input.className).toContain('pr-9')
    expect(input.className).not.toContain('pl-9')

    rerender(<TextField placeholder="名称" aria-label="名称" />)
    const plain = screen.getByLabelText('名称')
    expect(plain.className).not.toContain('pl-9')
    expect(plain.parentElement?.getAttribute('aria-hidden')).toBeNull()
  })
})

describe('TabBar 页签计数', () => {
  it('count 渲染为 muted 数字并保留 aria 语义', () => {
    render(
      <TabBar
        value="resume"
        onValueChange={() => {}}
        aria-label="资料库"
        items={[
          { value: 'resume', label: '我的简历', count: '02' },
          { value: 'target', label: '目标岗位' },
        ]}
      />,
    )
    const count = screen.getByText('02')
    expect(count.tagName).toBe('SPAN')
    expect(count.className).toContain('text-text-muted')
    expect(screen.getByRole('tab', { name: '目标岗位' }).querySelector('span')).toBeNull()
  })
})

describe('ConfirmModal', () => {
  it('danger 确认键红底,点击回调 onConfirm 并自动关闭', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmModal
        open
        onOpenChange={onOpenChange}
        title="移除这份资料?"
        description="移除后需重新上传并构建索引。"
        confirmText="移除"
        danger
        onConfirm={onConfirm}
      />,
    )
    const confirm = screen.getByRole('button', { name: '移除' })
    expect(confirm.className).toContain('bg-danger')
    expect(screen.getByText('移除后需重新上传并构建索引。')).toBeTruthy()
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('DropdownMenu iconTrigger 与勾选态', () => {
  it('iconTrigger 渲染 ⋯ 图标钮,checked 项行首带 ✓', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu
        iconTrigger
        aria-label="排序方式"
        items={[
          { value: 'recent', label: '最近使用', checked: true },
          { value: 'name', label: '名称' },
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: '排序方式' })
    expect(trigger.querySelector('svg')).not.toBeNull()

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    const recent = await screen.findByText('最近使用')
    expect(recent.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('名称').querySelector('svg')).toBeNull()
  })
})

describe('ToggleSwitch description', () => {
  it('description 渲染为 label 下的副文案行', () => {
    render(
      <ToggleSwitch
        defaultChecked
        label="使用参考资料"
        description="回答前从简历、岗位与参考资料中检索相关片段"
      />,
    )
    expect(screen.getByText('使用参考资料')).toBeTruthy()
    const desc = screen.getByText('回答前从简历、岗位与参考资料中检索相关片段')
    expect(desc.className).toContain('text-text-muted')
  })
})
