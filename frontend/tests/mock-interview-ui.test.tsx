// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import './ui/setup-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockConversation from '../src/renderer/src/features/mock-interview/MockConversation'
import MockPreparation from '../src/renderer/src/features/mock-interview/MockPreparation'
import MockQaExport from '../src/renderer/src/features/mock-interview/MockQaExport'
import { toast } from '../src/renderer/src/components/ui/toast'
import AvatarStage from '../src/renderer/src/features/mock-interview/AvatarStage'
import type { useMockInterview } from '../src/renderer/src/features/mock-interview/useMockInterview'
import type { MockBridge, MockSession } from '../src/shared/mock-interview'
vi.mock('../src/renderer/src/features/mock-interview/Avatar3D', () => ({ default: () => <div>3D 测试场景</div> }))
const id = '12345678-1234-4234-8234-123456789012'
const session: MockSession = { id, state: 'listening', version: 1, generation: 1, environmentName: '测试岗位', interviewType: 'technical', durationMinutes: 15, pauseMs: 2400, usedSeconds: 0, remainingSeconds: 900, avatarId: 'rewick-interviewer', voiceId: 'test', turns: [{ id, number: 1, question: '介绍项目', answerText: '', status: 'pending' }], currentTurnId: id, reportStatus: 'pending', createdAt: '2026-10-17T12:00:00' }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('mock interview interactions', () => {
  it('shows growing speech directly in the answer field without duplicating it below', () => {
    const interview = { session, draft: '我负责缓存。', partial: '还包括', busy: false, connected: true, micReady: true, edit: vi.fn(), editing: vi.fn() } as unknown as ReturnType<typeof useMockInterview>
    const { rerender } = render(<MockConversation interview={interview} onCommand={vi.fn()} />)
    const answer = screen.getByRole('textbox', { name: /你的回答/ }) as HTMLTextAreaElement
    expect(answer.value).toBe('我负责缓存。还包括')
    expect(screen.queryByText('还包括')).toBeNull()
    rerender(<MockConversation interview={{ ...interview, partial: '还包括故障处理' }} onCommand={vi.fn()} />)
    expect(answer.value).toBe('我负责缓存。还包括故障处理')
    rerender(<MockConversation interview={{ ...interview, draft: '我负责缓存。还包括故障处理。', partial: '' }} onCommand={vi.fn()} />)
    expect(answer.value).toBe('我负责缓存。还包括故障处理。')
  })
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
  it('exports saved Q&A without requesting an AI report and allows retry after failure', async () => {
    const user = userEvent.setup()
    const notify = vi.spyOn(toast, 'show').mockImplementation(() => 'test-toast')
    const exportQa = vi.fn().mockRejectedValueOnce(new Error('保存文件失败')).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const report = vi.fn(), retryReport = vi.fn()
    const bridge = { exportQa, report, retryReport } as unknown as MockBridge
    render(<MockQaExport bridge={bridge} id={id} />)
    const button = screen.getByRole('button', { name: '导出 Q&A Markdown' })
    await user.click(button)
    await waitFor(() => expect(notify).toHaveBeenCalledWith('保存文件失败', { type: 'error' }))
    expect(button.hasAttribute('disabled')).toBe(false)
    notify.mockClear(); await user.click(button)
    expect(notify).not.toHaveBeenCalled()
    await user.click(button)
    expect(notify).toHaveBeenCalledWith('问答 Markdown 已导出。')
    expect(exportQa).toHaveBeenCalledWith(id)
    expect(report).not.toHaveBeenCalled(); expect(retryReport).not.toHaveBeenCalled()
    notify.mockRestore()
  })
  it('lets the user switch from 3D to the animated 2D portrait', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { rerender } = render(<AvatarStage state="speaking" level={1} />)
    await userEvent.setup().click(screen.getByRole('button', { name: '2D' }))
    expect(screen.getByRole('group', { name: /面试官，/ }).getAttribute('aria-label')).toContain('讲话中')
    const portrait = document.querySelector('img[aria-hidden="true"]')
    expect(portrait?.getAttribute('data-frame')).toBe('2')
    rerender(<AvatarStage state="paused" level={1} />)
    expect(portrait?.getAttribute('data-frame')).toBe('0')
    expect(screen.getByText('未连接')).toBeTruthy()
    rerender(<AvatarStage state="listening" level={0} connected />)
    expect(screen.getByText('在线')).toBeTruthy()
    expect(screen.getByText('保持自然表达')).toBeTruthy()
    rerender(<AvatarStage state="completed" level={1} connected />)
    expect(screen.getByText('已结束')).toBeTruthy()
    expect(portrait?.getAttribute('data-frame')).toBe('0')
  })
  it('keeps the 2D portrait still when reduced motion is requested', async () => {
    const frame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', frame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
    render(<AvatarStage state="speaking" level={1} connected />)
    await userEvent.setup().click(screen.getByRole('button', { name: '2D' }))
    expect(document.querySelector('img[aria-hidden="true"]')?.getAttribute('data-frame')).toBe('0')
    expect(frame).not.toHaveBeenCalled()
    expect(screen.getByText('面试官讲话中')).toBeTruthy()
  })
})
