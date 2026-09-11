// @vitest-environment jsdom
/* 表单校验态(2026-09-11 增补):error 红边 + aria-invalid + 错误文案取代 hint;required 星标 */
import './setup-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TextField, TextareaField } from '../../src/renderer/src/components/ui/field'

afterEach(() => cleanup())

describe('TextField/TextareaField 校验态', () => {
  it('error 时:红边 + aria-invalid + 错误文案可见', () => {
    render(<TextField label="准备名称" hint="保存后可复用" error="名称不能为空" />)
    const input = screen.getByLabelText('准备名称')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.className).toContain('border-danger')
    expect(screen.getByText('名称不能为空')).toBeTruthy()
    // error 显示时取代 hint
    expect(screen.queryByText('保存后可复用')).toBeNull()
  })

  it('无 error 时:hint 正常显示,无 aria-invalid', () => {
    render(<TextField label="温度" hint="0~2" />)
    const input = screen.getByLabelText('温度')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.className).not.toContain('border-danger')
    expect(screen.getByText('0~2')).toBeTruthy()
  })

  it('TextareaField error 同样生效', () => {
    render(<TextareaField label="问题" error="至少输入一个字" />)
    const textarea = screen.getByLabelText('问题')
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.className).toContain('border-danger')
    expect(screen.getByText('至少输入一个字')).toBeTruthy()
  })

  it('required 时 label 追加红色星标(装饰性)', () => {
    render(<TextField label="名称" required />)
    const star = screen.getByText('*', { selector: 'span' })
    expect(star.getAttribute('aria-hidden')).toBe('true')
    expect(star.className).toContain('text-danger')
  })
})
