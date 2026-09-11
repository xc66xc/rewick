// @vitest-environment jsdom
/*
 * ref 契约测试(2026-09-11 组件库化基建):每个组件都必须把 ref 透传到最外层
 * 真实 DOM —— 聚焦控制 / 表单库 register / 测试焦点都依赖此契约。
 * 豁免:Modal(Portal,无实体意义)、toast(模块级 API)。
 */
import './setup-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { Button, IconButton, LinkButton, TextButton } from '../../src/renderer/src/components/ui/button'
import { Pill, StatusPill } from '../../src/renderer/src/components/ui/pill'
import { ToggleSwitch } from '../../src/renderer/src/components/ui/switch'
import { Segmented } from '../../src/renderer/src/components/ui/segmented'
import { TextField, TextareaField } from '../../src/renderer/src/components/ui/field'
import { AppSelect } from '../../src/renderer/src/components/ui/select'
import { CheckRow } from '../../src/renderer/src/components/ui/check-row'
import { TabBar } from '../../src/renderer/src/components/ui/tabs'
import { LevelMeter } from '../../src/renderer/src/components/ui/meter'
import { Collapse } from '../../src/renderer/src/components/ui/collapsible'

afterEach(() => cleanup())

describe('ref 透传契约', () => {
  it('Button/IconButton/LinkButton/TextButton → button 元素', () => {
    const r1 = createRef<HTMLButtonElement>()
    const r2 = createRef<HTMLButtonElement>()
    const r3 = createRef<HTMLButtonElement>()
    const r4 = createRef<HTMLButtonElement>()
    render(
      <div>
        <Button ref={r1}>a</Button>
        <IconButton ref={r2} aria-label="i" />
        <LinkButton ref={r3}>l</LinkButton>
        <TextButton ref={r4}>t</TextButton>
      </div>,
    )
    expect(r1.current?.tagName).toBe('BUTTON')
    expect(r2.current?.tagName).toBe('BUTTON')
    expect(r3.current?.tagName).toBe('BUTTON')
    expect(r4.current?.tagName).toBe('BUTTON')
  })

  it('Pill/StatusPill → span 元素', () => {
    const r1 = createRef<HTMLSpanElement>()
    const r2 = createRef<HTMLSpanElement>()
    render(
      <div>
        <Pill ref={r1}>p</Pill>
        <StatusPill ref={r2} status="ready">
          r
        </StatusPill>
      </div>,
    )
    expect(r1.current?.tagName).toBe('SPAN')
    expect(r2.current?.tagName).toBe('SPAN')
  })

  it('ToggleSwitch → span[role=switch](Base UI Switch 根为 span + 隐藏 input)', () => {
    const ref = createRef<HTMLSpanElement>()
    render(<ToggleSwitch ref={ref} label="自动回答" />)
    expect(ref.current?.tagName).toBe('SPAN')
    expect(ref.current?.getAttribute('role')).toBe('switch')
  })

  it('Segmented → 容器 div', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <Segmented
        ref={ref}
        value="a"
        onValueChange={() => {}}
        aria-label="s"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    )
    expect(ref.current?.tagName).toBe('DIV')
  })

  it('TextField → input;TextareaField → textarea', () => {
    const r1 = createRef<HTMLInputElement>()
    const r2 = createRef<HTMLTextAreaElement>()
    render(
      <div>
        <TextField ref={r1} label="a" />
        <TextareaField ref={r2} label="b" />
      </div>,
    )
    expect(r1.current?.tagName).toBe('INPUT')
    expect(r2.current?.tagName).toBe('TEXTAREA')
  })

  it('AppSelect → Trigger 按钮', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<AppSelect ref={ref} aria-label="x" options={[{ value: '1', label: '一' }]} />)
    expect(ref.current?.tagName).toBe('BUTTON')
  })

  it('CheckRow → input[type=checkbox]', () => {
    const ref = createRef<HTMLInputElement>()
    render(<CheckRow ref={ref} label="c" />)
    expect(ref.current?.tagName).toBe('INPUT')
    expect(ref.current?.type).toBe('checkbox')
  })

  it('TabBar → div[role=tablist]', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <TabBar
        ref={ref}
        value="a"
        onValueChange={() => {}}
        aria-label="t"
        items={[{ value: 'a', label: 'A' }]}
      />,
    )
    expect(ref.current?.tagName).toBe('DIV')
    expect(ref.current?.getAttribute('role')).toBe('tablist')
  })

  it('LevelMeter → role=meter 容器;Collapse → 根 div', () => {
    const r1 = createRef<HTMLDivElement>()
    const r2 = createRef<HTMLDivElement>()
    render(
      <div>
        <LevelMeter ref={r1} level={0.5} />
        <Collapse ref={r2} summary="s">
          body
        </Collapse>
      </div>,
    )
    expect(r1.current?.getAttribute('role')).toBe('meter')
    expect(r2.current?.tagName).toBe('DIV')
  })
})

describe('受控/非受控契约', () => {
  it('TextField 受控:value 由外部持有,onChange 透传原生事件', async () => {
    const user = userEvent.setup()
    function Host() {
      const [text, setText] = useState('ab')
      return <TextField label="名称" value={text} onChange={(e) => setText(e.currentTarget.value)} />
    }
    render(<Host />)
    const input = screen.getByLabelText('名称') as HTMLInputElement
    expect(input.value).toBe('ab')
    await user.type(input, 'c')
    expect(input.value).toBe('abc')
  })

  it('TextField 非受控:defaultValue 初值 + 可输入', async () => {
    const user = userEvent.setup()
    render(<TextField label="备注" defaultValue="x" />)
    const input = screen.getByLabelText('备注') as HTMLInputElement
    expect(input.value).toBe('x')
    await user.type(input, 'y')
    expect(input.value).toBe('xy')
  })
})
