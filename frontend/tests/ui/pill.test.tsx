// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Dot, Eyebrow, Pill, StatusPill } from '../../src/renderer/src/components/ui/pill'

afterEach(() => cleanup())

describe('Pill 胶囊与状态章', () => {
  it('Pill 渲染 subtle 底信息胶囊与内容', () => {
    render(<Pill>技术二面</Pill>)
    const pill = screen.getByText('技术二面')
    expect(pill.className).toContain('bg-subtle')
    expect(pill.className).toContain('border-border')
    expect(pill.tagName).toBe('SPAN')
  })

  it('StatusPill 四态映射样式与状态点', () => {
    const { rerender } = render(<StatusPill status="ready">可用</StatusPill>)
    const cases: Array<[string, string, string]> = [
      ['ready', 'text-success', 'bg-success'],
      ['busy', 'text-accent-text', 'bg-accent'],
      ['error', 'text-danger', 'bg-danger'],
      ['pending', 'text-text-regular', 'bg-text-muted'],
    ]
    for (const [status, pillClass, dotClass] of cases) {
      rerender(<StatusPill status={status as 'ready'}>标签</StatusPill>)
      const pill = screen.getByRole('status')
      expect(pill.className).toContain(pillClass)
      const dot = pill.querySelector('span')
      expect(dot?.className).toContain(dotClass)
    }
  })

  it('ready/busy 状态点呼吸,pending/error 不呼吸', () => {
    const { rerender } = render(<StatusPill status="ready">可用</StatusPill>)
    expect(screen.getByRole('status').querySelector('span')?.className).toContain('animate-pulse-dot')
    rerender(<StatusPill status="pending">等待</StatusPill>)
    expect(screen.getByRole('status').querySelector('span')?.className).not.toContain('animate-pulse-dot')
  })

  it('Dot 与 Eyebrow 基础渲染', () => {
    render(
      <>
        <Dot tone="danger" pulse={false} />
        <Eyebrow>SECTION</Eyebrow>
      </>,
    )
    expect(document.querySelector('.bg-danger')).not.toBeNull()
    expect(screen.getByText('SECTION').className).toContain('font-mono')
  })
})
