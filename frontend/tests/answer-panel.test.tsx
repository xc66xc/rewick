// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AnswerPanel from '../src/renderer/src/components/AnswerPanel'
import { defaultSettings } from '../src/shared/defaults'
import type { Answer } from '../src/shared/types'

afterEach(() => cleanup())

function answer(id: string, text: string, status: Answer['status'] = 'streaming'): Answer {
  return { id, question: `面试问题 ${id}`, text, status, createdAt: '2026-09-07T10:00:00.000Z' }
}

function setup(answers: Answer[]) {
  const props: ComponentProps<typeof AnswerPanel> = {
    settings: structuredClone(defaultSettings), onSettings: vi.fn(), onContext: vi.fn(),
    session: {
      record: { id: 'reading-session', title: '阅读回答', createdAt: '2026-09-07T10:00:00.000Z', segments: [], answers },
      question: '', questionAssembling: false, setQuestion: vi.fn(), generate: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined),
      busy: answers.some(value => value.status === 'streaming'), desktop: true,
    },
  }
  const view = render(<AnswerPanel {...props} />)
  const viewport = screen.getByRole('region', { name: '回答与面试信息' })
  function update(next: Answer[], compact = false) {
    view.rerender(<AnswerPanel {...props} compact={compact} session={{ ...props.session,
      record: { ...props.session.record, answers: next }, busy: next.some(value => value.status === 'streaming') }} />)
  }
  return { viewport, update, user: userEvent.setup() }
}

describe('reading answers without automatic scrolling', () => {
  it('keeps the reading position as a streaming answer grows, even when initially at the bottom', () => {
    const { viewport, update } = setup([answer('one', '第一段回答。')])
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 })
    viewport.scrollTop = 600

    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1600 })
    update([answer('one', '第一段回答。\n\n继续输出的新段落。')])
    expect(viewport.scrollTop).toBe(600)

    viewport.scrollTop = 120
    update([answer('one', '第一段回答。\n\n继续输出的新段落。\n\n回答结束。', 'complete')])
    expect(viewport.scrollTop).toBe(120)
  })

  it('preserves earlier-answer reading when a new answer arrives or compact mode changes', () => {
    const first = answer('one', '用户正在阅读的旧答案。', 'complete')
    const { viewport, update } = setup([first])
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 2000 })
    viewport.scrollTop = 180

    const next = [first, answer('two', '新问题的答案正在生成。')]
    update(next)
    expect(viewport.scrollTop).toBe(180)
    update(next, true)
    expect(viewport.scrollTop).toBe(180)
  })

  it('moves to the latest answer start only when requested and keeps that position during later output', async () => {
    const first = answer('one', '较早的答案。', 'complete')
    const latest = answer('two', '最新答案的第一段。')
    const { viewport, update, user } = setup([first, latest])
    viewport.scrollTop = 120
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 600, 400))
    vi.spyOn(screen.getByRole('article', { name: '回答 2' }), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 650, 600, 900))

    await user.click(screen.getByRole('button', { name: '查看最新回答' }))
    expect(viewport.scrollTop).toBe(670)

    update([first, { ...latest, text: `${latest.text}\n\n后续生成的正文。` }])
    expect(viewport.scrollTop).toBe(670)
  })
})
