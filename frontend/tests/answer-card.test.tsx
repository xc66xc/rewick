// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Answer } from '../src/shared/types'
import AnswerCard from '../src/renderer/src/components/AnswerCard'

const answer: Answer = { id: 'one', question: '介绍一下自己', text: '回答正文', status: 'complete' as const, createdAt: '2026-09-21T10:00:00Z', retrieval: { status: 'ready', web: { status: 'ready' }, excerpts: [{ documentId: 'doc', revision: 1, name: '参考资料', kind: 'technical', chunkId: 'chunk', text: '检索片段正文' }] } }
const singleRewrite: NonNullable<Answer['questionRewrite']> = { status: 'rewritten', question: '请介绍本人经历。', reason: null, model: 'rewrite-model', durationMs: 30, platformVersion: 2 }
const extractedRewrite: NonNullable<Answer['questionRewrite']> = {
  resultFormat: 'questions-v1', status: 'rewritten',
  questions: [
    { id: 'q1', question: '请介绍自己的项目经历。', sourceTexts: ['原始片段甲'], contextSourceTexts: ['讨论背景'] },
    { id: 'q2', question: '项目中遇到了哪些挑战？', sourceTexts: ['原始片段乙'] },
  ],
  reason: null, model: 'extract-model', durationMs: 40, platformVersion: 4,
}
const successfulRewriteCases = [
  { name: 'legacy single rewrite', result: singleRewrite, questions: ['请介绍本人经历。'] },
  { name: 'questions-v1 extraction', result: extractedRewrite, questions: ['请介绍自己的项目经历。', '项目中遇到了哪些挑战？'] },
]
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
it.each(successfulRewriteCases)('shows $name in one compact bubble between the shared label and the original question in production', ({ result, questions }) => {
  vi.stubEnv('DEV', false)
  render(<AnswerCard answer={{ ...answer, questionRewrite: result }} index={1} compact />)

  const original = screen.getByRole('heading', { name: answer.question })
  const header = original.closest('header')!
  const generated = within(header).getByRole('list', { name: '整理后的问题' })
  expect(generated.classList.contains('compact-answer__generated-bubble')).toBe(true)
  expect(header.getElementsByClassName('compact-answer__generated-bubble')).toHaveLength(1)
  expect(within(generated).getAllByRole('listitem').map(item => item.textContent)).toEqual(questions)
  expect(within(header).getAllByText('当前问题')).toHaveLength(1)
  for (const question of questions) expect(within(header).getAllByText(question)).toHaveLength(1)
  expect(header.textContent).toBe(['当前问题', ...questions, answer.question].join(''))
  expect(screen.getByText('回答正文')).toBeDefined()
  expect(screen.queryByRole('button', { name: /问题整理|问题提取/ })).toBeNull()
  expect(screen.queryByText(/本次发送内容/)).toBeNull()
  expect(screen.queryByText('本次检索资料')).toBeNull()
  expect(screen.queryByText('检索片段正文')).toBeNull()
  expect(screen.queryByText(/原话来源：|指代上下文：/)).toBeNull()
  expect(screen.queryByText(/rewrite-model|extract-model/)).toBeNull()
})
it.each(successfulRewriteCases)('shows $name in one compact bubble in development', ({ result, questions }) => {
  vi.stubEnv('DEV', true)
  render(<AnswerCard answer={{ ...answer, questionRewrite: result }} index={1} compact />)

  const header = screen.getByRole('heading', { name: answer.question }).closest('header')!
  const generated = within(header).getByRole('list', { name: '整理后的问题' })
  expect(generated.classList.contains('compact-answer__generated-bubble')).toBe(true)
  expect(header.getElementsByClassName('compact-answer__generated-bubble')).toHaveLength(1)
  expect(within(generated).getAllByRole('listitem').map(item => item.textContent)).toEqual(questions)
  for (const question of questions) expect(within(header).getAllByText(question)).toHaveLength(1)
  expect(header.textContent).toBe(['当前问题', ...questions, answer.question].join(''))
  expect(screen.getByRole('button', { name: /问题整理|问题提取/ })).toBeDefined()
})
it.each([
  { name: 'unchanged single result', questionRewrite: { ...singleRewrite, status: 'unchanged' as const, question: null, reason: 'unchanged' as const } },
  { name: 'skipped single result', questionRewrite: { ...singleRewrite, status: 'skipped' as const, question: null, reason: 'disabled' as const } },
  { name: 'failed single result', questionRewrite: { ...singleRewrite, status: 'degraded' as const, question: null, reason: 'provider_error' as const } },
  { name: 'unchanged extraction', questionRewrite: { ...extractedRewrite, status: 'unchanged' as const, questions: [], reason: 'unchanged' as const } },
  { name: 'skipped extraction', questionRewrite: { ...extractedRewrite, status: 'skipped' as const, questions: [], reason: 'disabled' as const } },
  { name: 'failed extraction', questionRewrite: { ...extractedRewrite, status: 'degraded' as const, questions: [], reason: 'timeout' as const } },
  { name: 'pending extraction', questionRewrite: undefined, preparationStage: 'question-rewrite' as const, status: 'streaming' as const },
  { name: 'absent result', questionRewrite: undefined },
])('keeps only the original compact question for $name', ({ name: _name, ...state }) => {
  vi.stubEnv('DEV', false)
  const { rerender } = render(<AnswerCard answer={{ ...answer, questionRewrite: extractedRewrite }} index={1} compact />)
  rerender(<AnswerCard answer={{ ...answer, ...state }} index={1} compact />)

  const header = screen.getByRole('heading', { name: answer.question }).closest('header')!
  expect(header.textContent).toBe(`当前问题${answer.question}`)
  expect(screen.queryByText('请介绍自己的项目经历。')).toBeNull()
  expect(screen.queryByText('项目中遇到了哪些挑战？')).toBeNull()
})
it.each(successfulRewriteCases)('keeps the normal question header unchanged for $name', ({ result, questions }) => {
  vi.stubEnv('DEV', false)
  render(<AnswerCard answer={{ ...answer, questionRewrite: result }} index={1} />)

  const header = screen.getByRole('heading', { name: answer.question }).closest('header')!
  expect(header.textContent).toBe(`Q01${answer.question}`)
  expect(screen.queryByText('当前问题')).toBeNull()
  for (const question of questions) expect(screen.queryByText(question)).toBeNull()
})
it('keeps a successful scalar rewrite even when it repeats the original question', () => {
  vi.stubEnv('DEV', false)
  render(<AnswerCard answer={{ ...answer, questionRewrite: { ...singleRewrite, question: answer.question } }} index={1} compact />)

  const header = screen.getByRole('heading', { name: answer.question }).closest('header')!
  expect(within(header).getAllByText(answer.question)).toHaveLength(2)
  expect(header.textContent).toBe(`当前问题${answer.question}${answer.question}`)
})
it('shows every model question in one bubble in order without filtering duplicate or original text', () => {
  vi.stubEnv('DEV', false)
  render(<AnswerCard answer={{ ...answer, questionRewrite: {
    ...extractedRewrite,
    questions: [
      { id: 'q1', question: answer.question, sourceTexts: ['模型提供的来源'] },
      { id: 'q2', question: '保留模型措辞', sourceTexts: ['模型提供的来源'] },
      { id: 'q3', question: answer.question, sourceTexts: ['模型提供的来源'] },
    ],
  } }} index={1} compact />)

  const header = screen.getByRole('heading', { name: answer.question }).closest('header')!
  const generated = within(header).getByRole('list', { name: '整理后的问题' })
  expect(generated.classList.contains('compact-answer__generated-bubble')).toBe(true)
  expect(header.getElementsByClassName('compact-answer__generated-bubble')).toHaveLength(1)
  expect(within(generated).getAllByRole('listitem').map(item => item.textContent)).toEqual([answer.question, '保留模型措辞', answer.question])
  expect(within(header).getAllByText(answer.question)).toHaveLength(3)
  expect(within(header).getByText('保留模型措辞')).toBeDefined()
  expect(header.textContent).toBe(`当前问题${answer.question}保留模型措辞${answer.question}${answer.question}`)
})
