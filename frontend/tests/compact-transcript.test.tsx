// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import CompactTranscript from '../src/renderer/src/components/CompactTranscript'
import type { TranscriptSegment } from '../src/shared/types'

afterEach(cleanup)
const segment: TranscriptSegment = { id: 'one', text: '请介绍', startMs: 0, isFinal: false }

it('updates the existing question bubble for partial and final speech without a transcript panel', () => {
  const { rerender } = render(<CompactTranscript />)
  expect(screen.queryByRole('region', { name: '实时转写' })).toBeNull()
  expect(screen.queryByRole('heading')).toBeNull()
  rerender(<CompactTranscript segment={segment} />)
  expect(screen.getByRole('heading', { name: '请介绍' }).className).toContain('compact-answer__question-bubble')
  rerender(<CompactTranscript segment={{ ...segment, text: '请介绍你的项目', isFinal: true }} />)
  expect(screen.getByRole('heading', { name: '请介绍你的项目' })).toBeTruthy()
})

it('removes a consumed preview and permits a new question with identical wording', () => {
  const final = { ...segment, text: '请介绍你的项目', isFinal: true }
  const { rerender } = render(<CompactTranscript segment={final} />)
  rerender(<CompactTranscript />)
  expect(screen.queryByRole('heading')).toBeNull()
  rerender(<CompactTranscript segment={{ ...final, id: 'two' }} />)
  expect(screen.getByRole('heading', { name: final.text })).toBeTruthy()
})

it('keeps the same multiline bubble while later clauses are recognized and corrected', () => {
  const { rerender } = render(<CompactTranscript segment={segment} />)
  const bubble = screen.getByRole('heading')
  rerender(<CompactTranscript segment={{ ...segment, text: '请介绍你的项目。\n遇到' }} />)
  expect(screen.getByRole('heading')).toBe(bubble)
  expect(bubble.textContent).toBe('请介绍你的项目。\n遇到')
  rerender(<CompactTranscript segment={{ ...segment, text: '请介绍你的项目。\n遇到过哪些难点？', isFinal: true }} />)
  expect(screen.getByRole('heading')).toBe(bubble)
  expect(bubble.textContent).toBe('请介绍你的项目。\n遇到过哪些难点？')
})
