// @vitest-environment jsdom
import './setup-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FieldRow, TextField, TextareaField } from '../../src/renderer/src/components/ui/field'

afterEach(() => cleanup())

describe('TextField / TextareaField 表单', () => {
  it('label 关联控件,hint 渲染说明,可输入', async () => {
    const user = userEvent.setup()
    render(<TextField id="prep-name" label="准备名称" hint="保存准备后,可从列表进入面试。" placeholder="例如" />)
    const input = screen.getByLabelText('准备名称') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(screen.getByText('保存准备后,可从列表进入面试。').tagName).toBe('P')
    await user.type(input, '字节二面')
    expect(input.value).toBe('字节二面')
  })

  it('TextareaField 渲染 textarea 并支持输入', async () => {
    const user = userEvent.setup()
    render(<TextareaField id="question" label="问题" rows={3} />)
    const area = screen.getByLabelText('问题') as HTMLTextAreaElement
    expect(area.tagName).toBe('TEXTAREA')
    await user.type(area, '介绍下项目')
    expect(area.value).toBe('介绍下项目')
  })

  it('disabled 态透传到控件', () => {
    render(<TextField id="temp" label="生成温度" disabled />)
    expect((screen.getByLabelText('生成温度') as HTMLInputElement).hasAttribute('disabled')).toBe(true)
  })

  it('FieldRow 双列布局容器', () => {
    const onChange = vi.fn()
    render(
      <FieldRow>
        <TextField id="a" label="甲" onChange={onChange} />
        <TextField id="b" label="乙" />
      </FieldRow>,
    )
    expect(screen.getByLabelText('甲')).toBeTruthy()
    expect(screen.getByLabelText('乙')).toBeTruthy()
  })
})
