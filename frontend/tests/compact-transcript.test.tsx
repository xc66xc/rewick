// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import CompactTranscript from '../src/renderer/src/components/CompactTranscript'
import type { TranscriptSegment } from '../src/shared/types'

afterEach(cleanup)

it('shows partial text immediately, retains final text and replaces it with the next sentence', () => {
  const { rerender } = render(<CompactTranscript />)
  expect(screen.getByText('等待语音')).toBeTruthy()
  const segment: TranscriptSegment = { id: 'one', text: '请介绍', startMs: 0, isFinal: false }
  rerender(<CompactTranscript segment={segment} />)
  expect(screen.getByLabelText('最新转写文字').textContent).toBe('请介绍')
  expect(screen.getByText('识别中…')).toBeTruthy()
  rerender(<CompactTranscript segment={{ ...segment, text: '请介绍你的项目', isFinal: true }} />)
  expect(screen.getByLabelText('最新转写文字').textContent).toBe('请介绍你的项目')
  expect(screen.getByText('已识别')).toBeTruthy()
  rerender(<CompactTranscript segment={{ ...segment, id: 'two', text: '用了什么技术' }} />)
  expect(screen.getByLabelText('最新转写文字').textContent).toBe('用了什么技术')
})
