// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InterviewPreparation from '../src/renderer/src/components/InterviewPreparation'
import { defaultSettings } from '../src/shared/defaults'
import type { DesktopBridge, InterviewLibrary } from '../src/shared/types'
import type { EnvironmentStamp } from '../src/shared/environment-stamp'
import { toast } from '../src/renderer/src/components/ui/toast'

vi.mock('../src/renderer/src/components/ui/toast', () => ({ toast: { show: vi.fn() } }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear() })
function setup(stamp?: EnvironmentStamp | null, active = false) {
  let library: InterviewLibrary = { resumes: [{ id: 'resume', name: '开发简历', text: '合成经历', createdAt: '', updatedAt: '' }], targets: [], environments: [{ id: 'env', name: 'Anker', version: 1, interviewType: 'technical', resumeId: 'resume', targetId: null, referenceIds: [], stamp, createdAt: '', updatedAt: '' }], activeEnvironmentId: 'env' }
  const saveStamp = vi.fn(async (input: { id: string; version: number; stamp: EnvironmentStamp | null }) => {
    library = { ...library, environments: library.environments.map(environment => ({ ...environment, stamp: input.stamp, version: input.version + 1 })) }
    return library
  })
  const bridge = { invitationSettings: vi.fn(async () => ({ enabled: false, rewardSeconds: 0, version: 0 })), getInterviewLibrary: vi.fn(async () => library), listReferences: vi.fn(async () => []), saveEnvironmentStamp: saveStamp, onEvent: () => () => undefined } as unknown as DesktopBridge
  const timer = { wallet: { availableSeconds: 600, version: 0, serverTime: new Date().toISOString(), session: null }, active, busy: false, refreshing: false, error: '', warning: '', remaining: 600, used: 0, start: vi.fn(), end: vi.fn(), refresh: vi.fn() }
  const onSave = vi.fn(), onPrepare = vi.fn()
  const props = { bridge, settings: { ...defaultSettings, accountScope: 'actor-one' }, timer, isSessionActive: active, onPrepare, onSave, onStarted: vi.fn(), onContext: vi.fn(), onSettings: vi.fn() }
  const view = render(<InterviewPreparation {...props} />)
  return { actor: userEvent.setup(), saveStamp, timer, onSave, onPrepare, props, view, bridge }
}
describe('personalized environment stamp', () => {
  it('removes shortcuts across reopening and remounting without changing the stamp or text', async () => {
    const { actor, saveStamp, view, props } = setup({ text: '一面中', color: 'blue' })
    await actor.click(await screen.findByRole('button', { name: '编辑印章 Anker：一面中' }))
    await actor.click(screen.getByRole('button', { name: '删除常用文案 一面中' }))
    expect(screen.queryByRole('button', { name: '一面中' })).toBeNull()
    expect((screen.getByRole('textbox', { name: '印章文字' }) as HTMLInputElement).value).toBe('一面中')
    expect(saveStamp).not.toHaveBeenCalled()
    await actor.click(screen.getByRole('button', { name: '取消' }))
    view.unmount()
    render(<InterviewPreparation {...props} />)
    await actor.click(await screen.findByRole('button', { name: '编辑印章 Anker：一面中' }))
    expect(screen.queryByRole('button', { name: '一面中' })).toBeNull()
    await actor.click(screen.getByRole('button', { name: '恢复默认' }))
    await actor.click(screen.getByRole('button', { name: '一面中' }))
    expect((screen.getByRole('textbox', { name: '印章文字' }) as HTMLInputElement).value).toBe('一面中')
  })
  it('isolates shortcut deletions when accounts switch and restores the previous account choice', async () => {
    const { actor, props, view } = setup()
    await actor.click(await screen.findByRole('button', { name: '加印章 Anker' }))
    await actor.click(screen.getByRole('button', { name: '删除常用文案 已挂' }))
    view.rerender(<InterviewPreparation {...props} settings={{ ...props.settings, accountScope: 'actor-two' }} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await actor.click(screen.getByRole('button', { name: '加印章 Anker' }))
    expect(screen.getByRole('button', { name: '已挂' })).toBeTruthy()
    view.rerender(<InterviewPreparation {...props} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await actor.click(screen.getByRole('button', { name: '加印章 Anker' }))
    expect(screen.queryByRole('button', { name: '已挂' })).toBeNull()
  })
  it('allows removing all shortcuts while custom text and default recovery remain available', async () => {
    const { actor } = setup()
    await actor.click(await screen.findByRole('button', { name: '加印章 Anker' }))
    for (const value of ['一面中', '等待二面中', '已下 offer', '已挂']) await actor.click(screen.getByRole('button', { name: `删除常用文案 ${value}` }))
    expect(screen.getByText('没有常用文案，仍可直接输入。')).toBeTruthy()
    await actor.type(screen.getByRole('textbox', { name: '印章文字' }), '等通知')
    expect((screen.getByRole('button', { name: '保存印章' }) as HTMLButtonElement).disabled).toBe(false)
    await actor.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(screen.getByRole('button', { name: '已挂' })).toBeTruthy()
  })
  it('reports unavailable preference storage without pretending a shortcut was removed', async () => {
    const { actor } = setup()
    await actor.click(await screen.findByRole('button', { name: '加印章 Anker' }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable') })
    await actor.click(screen.getByRole('button', { name: '删除常用文案 已挂' }))
    expect(screen.getByRole('button', { name: '已挂' })).toBeTruthy()
    expect(toast.show).toHaveBeenCalledWith('常用文案偏好保存失败，请重试。', { type: 'error' })
  })
  it('adds a selected text/color and clears it through the independent bridge', async () => {
    const { actor, saveStamp, onSave, onPrepare, timer } = setup()
    await actor.click(await screen.findByRole('button', { name: '加印章 Anker' }))
    const dialog = screen.getByRole('dialog', { name: '个性化印章' })
    await actor.click(within(dialog).getByRole('button', { name: '等待二面中' }))
    await actor.click(within(dialog).getByRole('button', { name: '橙色' }))
    expect(within(dialog).getByLabelText('印章预览 等待二面中')).toBeTruthy()
    await actor.click(within(dialog).getByRole('button', { name: '保存印章' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(saveStamp).toHaveBeenCalledWith({ id: 'env', version: 1, stamp: { text: '等待二面中', color: 'amber' } })
    await actor.click(screen.getByRole('button', { name: '编辑印章 Anker：等待二面中' }))
    await actor.click(screen.getByRole('button', { name: '清除印章' }))
    await screen.findByRole('button', { name: '加印章 Anker' })
    expect(saveStamp).toHaveBeenLastCalledWith({ id: 'env', version: 2, stamp: null })
    expect(onSave).not.toHaveBeenCalled(); expect(onPrepare).not.toHaveBeenCalled(); expect(timer.end).not.toHaveBeenCalled()
  })
  it('allows stamp editing while an active interview prevents ordinary editing', async () => {
    const { actor, saveStamp, timer } = setup({ text: '一面中', color: 'blue' }, true)
    expect((await screen.findByRole('button', { name: '编辑环境 Anker' }) as HTMLButtonElement).disabled).toBe(true)
    await actor.click(screen.getByRole('button', { name: '编辑印章 Anker：一面中' }))
    await actor.click(screen.getByRole('button', { name: '已挂' }))
    await actor.click(screen.getByRole('button', { name: '红色' }))
    await actor.click(screen.getByRole('button', { name: '保存印章' }))
    await waitFor(() => expect(saveStamp).toHaveBeenCalledWith({ id: 'env', version: 1, stamp: { text: '已挂', color: 'red' } }))
    expect(timer.end).not.toHaveBeenCalled()
  })
  it('counts emoji codepoints and disables saving beyond eight', async () => {
    const { actor, saveStamp } = setup()
    await actor.click(await screen.findByRole('button', { name: '加印章 Anker' }))
    const input = screen.getByRole('textbox', { name: '印章文字' })
    await actor.click(input); await actor.paste('😀'.repeat(8))
    expect((screen.getByRole('button', { name: '保存印章' }) as HTMLButtonElement).disabled).toBe(false)
    await actor.paste('😀')
    expect((screen.getByRole('button', { name: '保存印章' }) as HTMLButtonElement).disabled).toBe(true)
    expect(saveStamp).not.toHaveBeenCalled()
    await actor.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('retains custom draft and color after a conflict instead of closing or overwriting', async () => {
    const { actor, saveStamp } = setup({ text: '一面中', color: 'blue' })
    saveStamp.mockRejectedValueOnce(new Error('版本冲突，请刷新环境后重试。'))
    await actor.click(await screen.findByRole('button', { name: '编辑印章 Anker：一面中' }))
    const input = screen.getByRole('textbox', { name: '印章文字' })
    await actor.clear(input); await actor.type(input, '已下 offer')
    await actor.click(screen.getByRole('button', { name: '绿色' }))
    await actor.click(screen.getByRole('button', { name: '保存印章' }))
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith('版本冲突，请刷新环境后重试。', { type: 'error' }))
    expect((input as HTMLInputElement).value).toBe('已下 offer')
    expect(screen.getByRole('button', { name: '绿色' }).getAttribute('aria-pressed')).toBe('true')
    await actor.click(screen.getByRole('button', { name: '保存印章' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(saveStamp).toHaveBeenCalledTimes(2)
  })
  it('discards late old-account results and closes its dialog on account switch', async () => {
    const { actor, saveStamp, props, view } = setup()
    let finish: ((library: InterviewLibrary) => void) | undefined
    saveStamp.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await actor.click(await screen.findByRole('button', { name: '加印章 Anker' }))
    await actor.click(screen.getByRole('button', { name: '一面中' }))
    await actor.click(screen.getByRole('button', { name: '保存印章' }))
    view.rerender(<InterviewPreparation {...props} settings={{ ...props.settings, accountScope: 'actor-two' }} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    finish?.({ resumes: [], targets: [], environments: [], activeEnvironmentId: 'other' })
    await waitFor(() => expect(screen.getByRole('button', { name: '加印章 Anker' })).toBeTruthy())
    expect(toast.show).not.toHaveBeenCalled()
  })
})
