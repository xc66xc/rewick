// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import CompactTranscript from '../src/renderer/src/components/CompactTranscript'
import type { Answer, TranscriptSegment } from '../src/shared/types'

afterEach(cleanup)
const segment: TranscriptSegment = { id: 'one', text: '请介绍', startMs: 0, isFinal: false }
const answer: Answer = { id: 'answer-one', question: '请介绍你的项目', text: '已有答案', status: 'streaming', createdAt: '' }

it('updates the existing question bubble for partial and final speech without a transcript panel', () => {
  const { rerender } = render(<CompactTranscript recordId="session" />)
  expect(screen.queryByRole('region', { name: '实时转写' })).toBeNull()
  expect(screen.queryByRole('heading')).toBeNull()
  rerender(<CompactTranscript recordId="session" segment={segment} />)
  expect(screen.getByRole('heading', { name: '请介绍' }).className).toContain('compact-answer__question-bubble')
  rerender(<CompactTranscript recordId="session" segment={{ ...segment, text: '请介绍你的项目', isFinal: true }} />)
  expect(screen.getByRole('heading', { name: '请介绍你的项目' })).toBeTruthy()
})

it('removes the live duplicate after submission and shows a fresh question without changing the old answer', () => {
  const final = { ...segment, text: answer.question, isFinal: true }
  const { rerender } = render(<CompactTranscript recordId="session" segment={final} />)
  rerender(<CompactTranscript recordId="session" segment={final} answer={answer} />)
  expect(screen.queryByRole('heading')).toBeNull()
  rerender(<CompactTranscript recordId="session" segment={{ ...segment, text: '请介绍你的项目和技术栈' }} answer={answer} />)
  expect(screen.queryByRole('heading')).toBeNull()
  rerender(<CompactTranscript recordId="session" segment={{ ...final, id: 'two' }} answer={answer} />)
  expect(screen.getByRole('heading', { name: answer.question })).toBeTruthy()
  expect(answer.question).toBe('请介绍你的项目')
})

it('keeps unrelated speech when a manually typed question is submitted and resets for another session', () => {
  const { rerender } = render(<CompactTranscript recordId="session" segment={segment} />)
  rerender(<CompactTranscript recordId="session" segment={segment} answer={{ ...answer, question: '手动输入的问题' }} />)
  expect(screen.getByRole('heading', { name: '请介绍' })).toBeTruthy()
  rerender(<CompactTranscript recordId="other" segment={segment} />)
  expect(screen.getByRole('heading', { name: '请介绍' })).toBeTruthy()
})
