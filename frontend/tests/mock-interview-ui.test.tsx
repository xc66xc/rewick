// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockConversation from '../src/renderer/src/features/mock-interview/MockConversation'
import MockPreparation from '../src/renderer/src/features/mock-interview/MockPreparation'
import MockReportView from '../src/renderer/src/features/mock-interview/MockReportView'
import AvatarStage from '../src/renderer/src/features/mock-interview/AvatarStage'
import type { useMockInterview } from '../src/renderer/src/features/mock-interview/useMockInterview'
import type { MockBridge, MockSession } from '../src/shared/mock-interview'
const id = '12345678-1234-4234-8234-123456789012'
const session: MockSession = { id, state: 'listening', version: 1, generation: 1, environmentName: '测试岗位', interviewType: 'technical', durationMinutes: 15, pauseMs: 2400, usedSeconds: 0, remainingSeconds: 900, avatarId: 'rewick-interviewer', voiceId: 'test', turns: [{ id, number: 1, question: '介绍项目', answerText: '', status: 'pending' }], currentTurnId: id, reportStatus: 'pending', createdAt: '2026-10-17T12:00:00' }
afterEach(cleanup)
describe('mock interview interactions', () => {
  it('shows actual current question and lets user edit and submit the microphone answer', async () => {
    const user = userEvent.setup(), command = vi.fn(), edit = vi.fn(), editing = vi.fn()
    const interview = { session, draft: '我负责缓存设计', partial: '', busy: false, connected: true, micReady: true, edit, editing } as unknown as ReturnType<typeof useMockInterview>
    render(<MockConversation interview={interview} onCommand={command} />)
    expect(screen.getByText('第 1 题 · 介绍项目')).toBeTruthy()
    expect(screen.getByText('正在倾听，停顿 2.4 秒后自动提交。')).toBeTruthy()
    const answer = screen.getByRole('textbox', { name: /你的回答/ })
    await user.click(answer); await user.type(answer, '，并验证了失效策略')
    expect(editing).toHaveBeenCalledWith(true); expect(edit).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '我回答完了' }))
    expect(editing).toHaveBeenCalledWith(false); expect(command).toHaveBeenCalledWith('submit_answer')
  })
  it('offers button interruption while speaking without allowing microphone submission', async () => {
    const user = userEvent.setup(), command = vi.fn()
    render(<MockConversation interview={{ session: { ...session, state: 'speaking' }, busy: false, connected: true } as ReturnType<typeof useMockInterview>} onCommand={command} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '我回答完了' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '打断并回答' })); expect(command).toHaveBeenCalledWith('interrupt')
  })
  it('does not permit starting with no independent mock balance', () => {
    render(<MockPreparation capabilities={{ enabled: true, voices: [{ id: 'test', name: '声音' }], avatars: [{ id: 'rewick-interviewer', name: '面试官' }], durations: [15, 30, 45] }} environments={[]} busy={false} balance={0} onCreate={vi.fn()} />)
    expect(screen.getByRole('button', { name: '准备面试' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/辅助面试余额不能抵扣/)).toBeTruthy()
  })
  it('renders structured evidence report without inserting HTML from the model', async () => {
    const bridge = { report: vi.fn(async () => ({ status: 'ready', report: { summary: '表达清楚', evidence: ['<script>unsafe()</script>'] } })) } as unknown as MockBridge
    render(<MockReportView bridge={bridge} id={id} />)
    expect(await screen.findByText('表达清楚')).toBeTruthy(); expect(screen.getByText('<script>unsafe()</script>')).toBeTruthy()
    expect(document.querySelector('script')).toBeNull()
  })
  it('retries failed report and reloads it to completion', async () => {
    const user = userEvent.setup()
    const report = vi.fn().mockResolvedValueOnce({ status: 'failed', error: '生成失败' }).mockResolvedValue({ status: 'ready', report: { summary: '复盘已恢复' } })
    const bridge = { report, retryReport: vi.fn(async () => ({ status: 'pending' })) } as unknown as MockBridge
    render(<MockReportView bridge={bridge} id={id} />)
    await user.click(await screen.findByRole('button', { name: '重新生成报告' }))
    expect(await screen.findByText('复盘已恢复')).toBeTruthy()
    await waitFor(() => expect(bridge.retryReport).toHaveBeenCalledWith(id, expect.any(String)))
  })
  it('uses audio level for speaking mouth state and a closed mouth while paused', () => {
    const { rerender } = render(<AvatarStage state="speaking" level={1} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('讲话中')
    const mouth = document.querySelector('ellipse[cx="160"][cy="179"]'); expect(mouth?.getAttribute('ry')).toBe('15')
    rerender(<AvatarStage state="paused" level={1} />)
    expect(document.querySelector('ellipse[cx="160"][cy="179"]')?.getAttribute('visibility')).toBe('hidden')
  })
})
