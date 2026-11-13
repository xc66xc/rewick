// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
it.each([false, true])('shows the preparation status without replacing the current question, compact=%s', compact => {
  render(<AnswerCard answer={{ ...answer, text: '', status: 'streaming', preparationStage: 'question-rewrite' }} index={1} compact={compact} />)
  expect(screen.getByText('正在整理问题')).toBeDefined()
  expect(screen.getByRole('heading', { name: answer.question })).toBeDefined()
})
it.each([false, true])('shows rewrite diagnostics only in development, DEV=%s', development => {
  vi.stubEnv('DEV', development)
  render(<AnswerCard answer={{ ...answer, questionRewrite: { status: 'rewritten', question: '请介绍本人经历。', reason: null, model: 'rewrite-model', durationMs: 30, platformVersion: 2 } }} index={1} />)
  expect(Boolean(screen.queryByText('问题整理 · 已整理'))).toBe(development)
  expect(screen.getByRole('heading', { name: answer.question })).toBeDefined()
})
it.each([false, true])('shows extracted questions, raw provenance and actual sent coverage only in development, DEV=%s', async development => {
  vi.stubEnv('DEV', development)
  const user = userEvent.setup()
  render(<AnswerCard answer={{ ...answer, questionRewrite: { resultFormat: 'questions-v1', status: 'rewritten', questions: [{ id: 'q1', question: '请介绍自己的项目经历。', sourceTexts: ['介绍一下自己'], contextSourceTexts: ['本轮讨论项目'] }], reason: null, model: 'extract-model', durationMs: 40, platformVersion: 4 },
    retrieval: { status: 'degraded', excerpts: [], queries: [{ questionId: 'q1', status: 'degraded', excerptIds: [], message: '本轮检索预算已用尽。' }] } }} index={1} />)
  const summary = screen.queryByRole('button', { name: '问题提取 · 已整理 · 1 题' })
  expect(Boolean(summary)).toBe(development)
  if (summary) {
    await user.click(summary)
    expect(screen.getByRole('heading', { name: 'q1 · 请介绍自己的项目经历。' })).toBeDefined()
    expect(screen.getByText('原话来源：介绍一下自己')).toBeDefined()
    expect(screen.getByText('指代上下文：本轮讨论项目')).toBeDefined()
    expect(screen.getByText(/实际送入 0 份证据/)).toBeDefined()
  }
  expect(screen.getByRole('heading', { name: answer.question })).toBeDefined()
})
