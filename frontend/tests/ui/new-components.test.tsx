// @vitest-environment jsdom
/* 2026-09-11 新增基建组件:Avatar/Badge/Kbd/Divider/Skeleton/EmptyState/Tooltip/DropdownMenu/Table */
import './setup-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sparkle } from '@phosphor-icons/react'
import { Avatar } from '../../src/renderer/src/components/ui/avatar'
import { Badge } from '../../src/renderer/src/components/ui/badge'
import { Kbd } from '../../src/renderer/src/components/ui/kbd'
import { Divider } from '../../src/renderer/src/components/ui/divider'
import { Skeleton } from '../../src/renderer/src/components/ui/skeleton'
import { EmptyState } from '../../src/renderer/src/components/ui/empty-state'
import { Tooltip } from '../../src/renderer/src/components/ui/tooltip'
import { DropdownMenu } from '../../src/renderer/src/components/ui/menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../src/renderer/src/components/ui/table'
import { Button } from '../../src/renderer/src/components/ui/button'

afterEach(() => cleanup())

describe('Avatar', () => {
  it('拉丁名取前两词首字母大写("Lin Xu"→"LX")', () => {
    render(<Avatar name="Lin Xu" />)
    expect(screen.getByText('LX')).toBeTruthy()
  })

  it('中文名取首字("林序"→"林")', () => {
    render(<Avatar name="林序" />)
    expect(screen.getByText('林')).toBeTruthy()
  })

  it('提供 src 时渲染图片', () => {
    render(<Avatar name="林序" src="https://example.com/a.png" />)
    expect(document.querySelector('img[src="https://example.com/a.png"]')).not.toBeNull()
  })
})

describe('Badge / Kbd / Divider / Skeleton', () => {
  it('Badge 渲染计数', () => {
    render(<Badge>02</Badge>)
    expect(screen.getByText('02').tagName).toBe('SPAN')
  })

  it('Kbd 渲染 kbd 元素', () => {
    render(<Kbd>⌘ ↵</Kbd>)
    expect(document.querySelector('kbd')?.textContent).toBe('⌘ ↵')
  })

  it('Divider 渲染语义化 hr', () => {
    render(<Divider />)
    expect(document.querySelector('hr.border-border')).not.toBeNull()
  })

  it('Skeleton 为装饰性占位(aria-hidden)', () => {
    render(<Skeleton className="h-4 w-2/3" />)
    const el = document.querySelector('div[aria-hidden]')
    expect(el?.className).toContain('animate-pulse-dot')
    expect(el?.className).toContain('h-4')
  })
})

describe('EmptyState', () => {
  it('渲染瓷片 + 标题 + 说明,success 色调换绿瓷片', () => {
    const { rerender } = render(
      <EmptyState icon={<Sparkle />} title="等待第一道问题" description="面试官提问停顿后自动生成回答。" />,
    )
    expect(screen.getByText('等待第一道问题').tagName).toBe('H3')
    expect(screen.getByText('面试官提问停顿后自动生成回答。')).toBeTruthy()
    rerender(
      <EmptyState icon={<Sparkle />} tone="success" title="等待第一道问题" description="面试官提问停顿后自动生成回答。" />,
    )
    expect(document.querySelector('span.bg-success-subtle')).not.toBeNull()
  })
})

describe('Tooltip', () => {
  it('悬停触发元素后出现提示内容', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="置顶预览窗">
        <Button>置顶</Button>
      </Tooltip>,
    )
    await user.hover(screen.getByRole('button', { name: '置顶' }))
    await waitFor(
      () => {
        expect(screen.getByText('置顶预览窗')).toBeTruthy()
      },
      { timeout: 2500 },
    )
  })
})

describe('DropdownMenu', () => {
  it('触发器 ArrowDown 展开键盘导航,选择 item 回调 value 并关闭(点击开菜单依赖 PointerEvent 细节,jsdom 用官方键盘路径)', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <DropdownMenu
        trigger="更多操作"
        onValueChange={onValueChange}
        items={[
          { kind: 'label', label: '资料操作' },
          { value: 'preview', label: '预览' },
          { value: 'reindex', label: '重建索引', disabled: true },
          { kind: 'divider' },
          { value: 'remove', label: '移除', danger: true },
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: /更多操作/ })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('资料操作')).toBeTruthy()
    expect(screen.getByText('预览')).toBeTruthy()

    await user.click(screen.getByText('移除'))
    expect(onValueChange).toHaveBeenCalledWith('remove')
    await waitFor(() => {
      expect(screen.queryByText('预览')).toBeNull()
    })
  })
})

describe('Table 基元', () => {
  it('渲染表头与数据行', () => {
    render(
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>面试 / 会话</TableHeader>
            <TableHeader>时间</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>字节跳动 · 技术二面</TableCell>
            <TableCell>刚刚</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(screen.getByText('面试 / 会话').tagName).toBe('TH')
    expect(screen.getByText('字节跳动 · 技术二面').tagName).toBe('TD')
    expect(document.querySelector('thead.bg-subtle')).not.toBeNull()
  })
})
