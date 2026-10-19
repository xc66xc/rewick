// @vitest-environment jsdom
import './setup-dom'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppSelect } from '../../src/renderer/src/components/ui/select'
import { TabBar } from '../../src/renderer/src/components/ui/tabs'
import { Collapse } from '../../src/renderer/src/components/ui/collapsible'
import { LevelMeter } from '../../src/renderer/src/components/ui/meter'
import { CheckRow, ChoiceRow } from '../../src/renderer/src/components/ui/check-row'

afterEach(() => cleanup())

describe('CheckRow / ChoiceRow 原生勾选', () => {
  it('CheckRow 点击行内任意处切换并回调', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CheckRow label="自动包含简历" checked={false} onChange={onChange} />)
    const input = screen.getByLabelText('自动包含简历') as HTMLInputElement
    expect(input.type).toBe('checkbox')
    await user.click(screen.getByText('自动包含简历'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('ChoiceRow 同名 radio 天然成组,互斥切换', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ChoiceRow name="audio-source" value="system" defaultChecked label="系统音频" />
        <ChoiceRow name="audio-source" value="microphone" label="麦克风" />
      </>,
    )
    const local = screen.getByLabelText('系统音频') as HTMLInputElement
    const remote = screen.getByLabelText('麦克风') as HTMLInputElement
    expect(local.type).toBe('radio')
    expect(local.checked).toBe(true)
    await user.click(remote)
    expect(remote.checked).toBe(true)
    expect(local.checked).toBe(false)
    expect(remote.closest('label')?.className).toContain('has-[:checked]:bg-accent-subtle')
  })
})

describe('TabBar 页签', () => {
  it('点击页签回调新值,受控后 data-active 跟随', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [tab, setTab] = useState('resume')
      return (
        <TabBar
          value={tab}
          onValueChange={setTab}
          aria-label="资料库"
          items={[
            { value: 'resume', label: '简历' },
            { value: 'jd', label: '职位描述' },
          ]}
        />
      )
    }
    render(<Harness />)
    const resume = screen.getByRole('tab', { name: '简历' })
    const jd = screen.getByRole('tab', { name: '职位描述' })
    expect(resume.hasAttribute('data-active')).toBe(true)
    await user.click(jd)
    expect(jd.hasAttribute('data-active')).toBe(true)
    expect(resume.hasAttribute('data-active')).toBe(false)
  })
})

describe('LevelMeter 电平条', () => {
  it('按 level 点亮对应格数并钳制越界值', () => {
    const { container } = render(<LevelMeter level={0.5} />)
    expect(container.querySelectorAll('.bg-success').length).toBe(7)
    expect(container.querySelectorAll('.bg-led-idle').length).toBe(7)
    container.remove()
    cleanup()
    const full = render(<LevelMeter level={1} />).container
    expect(full.querySelectorAll('.bg-success').length).toBe(14)
    full.remove()
    cleanup()
    const over = render(<LevelMeter level={2} />).container
    expect(over.querySelectorAll('.bg-success').length).toBe(14)
    over.remove()
    cleanup()
    const zero = render(<LevelMeter level={0} />).container
    expect(zero.querySelectorAll('.bg-success').length).toBe(0)
  })
})

describe('Collapse 折叠详情', () => {
  it('默认收起,点击 summary 展开', async () => {
    const user = userEvent.setup()
    render(<Collapse summary="本次检索资料(3 段)">检索片段正文</Collapse>)
    expect(screen.queryByText('检索片段正文')).toBeNull()
    await user.click(screen.getByRole('button', { name: '本次检索资料(3 段)' }))
    expect(screen.getByText('检索片段正文')).toBeTruthy()
  })

  it('defaultOpen 直接展开', () => {
    render(<Collapse summary="本次发送内容" defaultOpen>发送正文</Collapse>)
    expect(screen.getByText('发送正文')).toBeTruthy()
  })
})

describe('AppSelect 选择器', () => {
  it('渲染选中项标签,无值时显示占位符', () => {
    render(
      <AppSelect
        aria-label="回答模型"
        defaultValue="deepseek"
        options={[
          { value: 'deepseek', label: 'DeepSeek Chat' },
          { value: 'gpt', label: 'GPT-4o mini' },
        ]}
      />,
    )
    expect(screen.getByText('DeepSeek Chat')).toBeTruthy()
    cleanup()
    render(<AppSelect aria-label="来源" options={[{ value: 'x', label: '选项' }]} />)
    expect(screen.getByText('请选择')).toBeTruthy()
  })

  it('三档规格与禁用态', () => {
    render(
      <div>
        <AppSelect size="lg" aria-label="大" options={[{ value: 'x', label: '选项' }]} />
        <AppSelect size="md" aria-label="中" options={[{ value: 'x', label: '选项' }]} />
        <AppSelect size="sm" disabled aria-label="禁用" options={[{ value: 'x', label: '选项' }]} />
      </div>,
    )
    expect(screen.getByLabelText('大').className).toContain('text-sm')
    expect(screen.getByLabelText('中').className).toContain('text-[13px]')
    const trigger = screen.getByLabelText('禁用')
    expect(trigger.className).toContain('text-[11.5px]')
    expect(trigger.hasAttribute('disabled')).toBe(true)
  })
})
