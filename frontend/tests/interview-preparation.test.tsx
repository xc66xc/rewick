// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InterviewPreparation from '../src/renderer/src/components/InterviewPreparation'
import { defaultSettings } from '../src/shared/defaults'
import type { DesktopBridge, EnvironmentInput, InterviewLibrary } from '../src/shared/types'

afterEach(cleanup)
function setup(resumeId: string | null = 'resume', availableSeconds = 600) {
  const library: InterviewLibrary = { resumes: [{ id: 'resume', name: '开发简历', text: '开发工程师经历', createdAt: '', updatedAt: '' }], targets: [], environments: [{ id: 'env', name: '默认环境', resumeId, targetId: null, referenceIds: [], createdAt: '', updatedAt: '' }], activeEnvironmentId: 'env' }
  const bridge = { getInterviewLibrary: vi.fn(async () => library), listReferences: vi.fn(async () => []), onEvent: () => () => undefined } as unknown as DesktopBridge
  const start = vi.fn(async () => undefined)
  const onPrepare = vi.fn(async (_input: EnvironmentInput) => undefined)
  const onStarted = vi.fn()
  const timer = { wallet: { availableSeconds, version: 0, serverTime: new Date().toISOString(), session: null }, active: false, busy: false, error: '', warning: '', remaining: availableSeconds, used: 0, start, end: vi.fn(async () => undefined), refresh: vi.fn(async () => undefined) }
  render(<InterviewPreparation bridge={bridge} settings={defaultSettings} timer={timer} onPrepare={onPrepare} onStarted={onStarted} onContext={vi.fn()} onSettings={vi.fn()} />)
  return { actor: userEvent.setup(), start, onPrepare, onStarted }
}
describe('interview preparation', () => {
  it('requires a resume but allows an empty job description and reference selection', async () => {
    const { actor, start, onPrepare, onStarted } = setup(null)
    const button = await screen.findByRole('button', { name: '开始面试' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await actor.selectOptions(screen.getByLabelText('本次简历（必填）'), 'resume')
    await actor.click(button)
    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(onPrepare.mock.calls[0][0]).toMatchObject({ resumeId: 'resume', targetId: null, referenceIds: [] })
    expect(onPrepare.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0])
    expect(onStarted).toHaveBeenCalledOnce()
  })
  it('does not start charging if preparing the context fails', async () => {
    const { actor, start, onPrepare, onStarted } = setup()
    onPrepare.mockRejectedValueOnce(new Error('保存失败，请重试'))
    await actor.click(await screen.findByRole('button', { name: '开始面试' }))
    expect((await screen.findByRole('alert')).textContent).toContain('保存失败')
    expect(start).not.toHaveBeenCalled()
    expect(onStarted).not.toHaveBeenCalled()
  })
  it('keeps preparation accessible with zero available time', async () => {
    const { start } = setup('resume', 0)
    expect((await screen.findByRole('button', { name: '开始面试' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText('本次简历（必填）')).toBeTruthy()
    expect(start).not.toHaveBeenCalled()
  })
})
