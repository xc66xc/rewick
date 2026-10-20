// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Answer } from '../src/shared/types'
import AnswerCard from '../src/renderer/src/components/AnswerCard'

const answer: Answer = { id: 'one', question: '介绍一下自己', text: '回答正文', status: 'complete' as const, createdAt: '2026-09-21T10:00:00Z', retrieval: { status: 'ready', web: { status: 'ready' }, excerpts: [{ documentId: 'doc', revision: 1, name: '参考资料', kind: 'technical', chunkId: 'chunk', text: '检索片段正文' }] } }
afterEach(() => { cleanup(); vi.unstubAllEnvs() })
it.each([false, true])('hides model input in production, compact=%s', compact => {
  vi.stubEnv('DEV', false)
  render(<AnswerCard answer={answer} index={1} compact={compact} />)
  expect(screen.queryByText(/本次发送内容/)).toBeNull()
  expect(screen.queryByText('本次检索资料')).toBeNull()
  expect(screen.queryByText(/联网搜索：/)).toBeNull()
  expect(screen.queryByText('检索片段正文')).toBeNull()
  expect(screen.getByText('回答正文')).toBeDefined()
})
it.each([false, true])('shows the model input entry in development, compact=%s', compact => {
  vi.stubEnv('DEV', true)
  render(<AnswerCard answer={answer} index={1} compact={compact} />)
  expect(screen.getAllByText(/本次发送内容/).length).toBeGreaterThan(0)
  if (!compact) expect(screen.getByText('本次检索资料')).toBeDefined()
})
