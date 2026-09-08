// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppendQuestionButton from '../src/renderer/src/components/AppendQuestionButton'
import QuestionComposer from '../src/renderer/src/components/QuestionComposer'

let contentHeight = 28
let inputWidth = 400
let resized: () => void = () => undefined

beforeEach(() => {
  contentHeight = 28; inputWidth = 400
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback }
    observe() {} unobserve() {} disconnect() {}
  })
  // jsdom has no layout; provide line metrics and the measured text size a browser would report.
  const originalStyle = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    if (!(element instanceof HTMLTextAreaElement)) return originalStyle(element)
    const style = document.createElement('textarea').style
    style.lineHeight = '20px'; style.fontSize = '12px'; style.padding = '4px 0'; style.border = '0px'
    return style
  })
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => contentHeight })
  Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', { configurable: true, get: () => inputWidth })
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLTextAreaElement.prototype, 'scrollHeight')
  Reflect.deleteProperty(HTMLTextAreaElement.prototype, 'clientWidth')
})

describe('adding a transcript sentence to the question', () => {
  it('briefly blocks repeated clicks after success and permits the sentence to be added again later', async () => {
    const onAppend = vi.fn(() => true)
    const user = userEvent.setup()
    render(<AppendQuestionButton segmentId="one" text="如何设计缓存？" disabled={false} onAppend={onAppend} />)
    const button = screen.getByRole('button', { name: '加入问题：如何设计缓存？' }) as HTMLButtonElement
    await user.dblClick(button)
    expect(onAppend).toHaveBeenCalledExactlyOnceWith('one')
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('已加入')

    await waitFor(() => expect(button.disabled).toBe(false), { timeout: 1500 })
    await user.click(button)
    expect(onAppend).toHaveBeenCalledTimes(2)
  })

  it('reads the visible sentence before blurring its editor and never focuses the question composer', async () => {
    const user = userEvent.setup()
    const events: string[] = []
    const onAppend = vi.fn(() => { events.push(document.activeElement?.getAttribute('aria-label') || 'unknown'); return true })
    render(<><textarea aria-label="转写文字 1" onBlur={() => events.push('blur')} /><textarea aria-label="当前问题" />
      <AppendQuestionButton segmentId="one" text="临时字幕" disabled={false} onAppend={onAppend} /></>)
    await user.click(screen.getByRole('textbox', { name: '转写文字 1' }))
    const button = screen.getByRole('button', { name: '加入问题：临时字幕' })
    await user.click(button)
    expect(events).toEqual(['转写文字 1', 'blur'])
    expect(document.activeElement).toBe(button)
  })

  it('does not show success or lock the button when adding was rejected', async () => {
    const onAppend = vi.fn(() => false)
    const user = userEvent.setup()
    render(<AppendQuestionButton segmentId="one" text="超过长度限制的追加" disabled={false} onAppend={onAppend} />)
    const button = screen.getByRole('button', { name: '加入问题：超过长度限制的追加' }) as HTMLButtonElement
    await user.click(button)
    expect(button.disabled).toBe(false)
    expect(button.textContent).toBe('加入问题')
  })
})

function ComposerHarness({ assembling = true }: { assembling?: boolean }) {
  const [question, setQuestion] = useState('第一段问题\n第二段问题\n第三段问题\n第四段问题')
  const [questionAssembling, setAssembling] = useState(assembling)
  return <QuestionComposer session={{ question, questionAssembling, busy: false, desktop: true,
    setQuestion: value => { setQuestion(value); if (!value.trim()) setAssembling(false) },
    generate: async () => undefined, cancel: async () => undefined }} />
}

describe('editing an assembled question', () => {
  it('caps the input at three lines and restores a one-line input when cleared', async () => {
    contentHeight = 248
    const user = userEvent.setup()
    render(<ComposerHarness />)
    const input = screen.getByRole('textbox', { name: '当前问题' }) as HTMLTextAreaElement
    expect(input.style.height).toBe('68px')
    expect(screen.getByRole('status').textContent).toBe('正在合并问题')

    await user.click(screen.getByRole('button', { name: '清空当前问题' }))
    expect(input.value).toBe('')
    expect(input.style.height).toBe('')
    expect(input.rows).toBe(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('resizes when wrapping width or edited content changes without stealing focus', async () => {
    const user = userEvent.setup()
    render(<ComposerHarness />)
    const input = screen.getByRole('textbox', { name: '当前问题' }) as HTMLTextAreaElement
    expect(input.style.height).toBe('28px')
    await user.click(input)

    inputWidth = 200; contentHeight = 200; resized()
    expect(input.style.height).toBe('68px')
    expect(document.activeElement).toBe(input)

    contentHeight = 48
    await user.keyboard('{Backspace}')
    expect(input.style.height).toBe('48px')
  })

  it('preserves manually resized ordinary drafts during typing', async () => {
    const user = userEvent.setup()
    render(<ComposerHarness assembling={false} />)
    const input = screen.getByRole('textbox', { name: '当前问题' }) as HTMLTextAreaElement
    input.style.height = '120px'
    await user.type(input, '继续手工输入')
    expect(input.style.height).toBe('120px')
    expect(screen.queryByRole('button', { name: '清空当前问题' })).toBeNull()
  })
})
