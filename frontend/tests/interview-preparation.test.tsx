// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InterviewPreparation from '../src/renderer/src/components/InterviewPreparation'
import { defaultSettings } from '../src/shared/defaults'
import type { DesktopBridge, EnvironmentInput, InterviewLibrary } from '../src/shared/types'

afterEach(cleanup)
function setup(resumeId: string | null = 'resume', availableSeconds = 600, secondEnvironment = false) {
  const library: InterviewLibrary = { resumes: [{ id: 'resume', name: '开发简历', text: '开发工程师经历', createdAt: '', updatedAt: '' }], targets: [], environments: [{ id: 'env', name: '默认环境', resumeId, targetId: null, referenceIds: [], createdAt: '', updatedAt: '' }], activeEnvironmentId: 'env' }
  if (secondEnvironment) library.environments.push({ id: 'env-2', name: '备用环境', resumeId, targetId: null, referenceIds: [], createdAt: '', updatedAt: '' })
  const bridge = { getInterviewLibrary: vi.fn(async () => library), listReferences: vi.fn(async () => []), removeEnvironment: vi.fn(async (id: string) => ({ ...library, environments: library.environments.filter(record => record.id !== id) })), onEvent: () => () => undefined } as unknown as DesktopBridge
  const start = vi.fn(async () => undefined)
  const onPrepare = vi.fn(async (_input: EnvironmentInput) => undefined)
  const onSave = vi.fn(async (input: EnvironmentInput) => {
    const index = library.environments.findIndex(record => record.id === input.id)
    if (index >= 0) library.environments[index] = { ...library.environments[index], ...input }
    else library.environments = [...library.environments, { ...input, id: `env-${library.environments.length + 1}`, createdAt: '', updatedAt: '' }]
  })
  const onStarted = vi.fn()
  const timer = { wallet: { availableSeconds, version: 0, serverTime: new Date().toISOString(), session: null }, active: false, busy: false, refreshing: false, error: '', warning: '', remaining: availableSeconds, used: 0, start, end: vi.fn(async () => undefined), refresh: vi.fn(async () => undefined) }
  render(<InterviewPreparation bridge={bridge} settings={defaultSettings} timer={timer} isSessionActive={false} onPrepare={onPrepare} onSave={onSave} onStarted={onStarted} onContext={vi.fn()} onSettings={vi.fn()} />)
  return { actor: userEvent.setup(), start, onPrepare, onSave, onStarted, bridge }
}
async function pickOption(actor: ReturnType<typeof userEvent.setup>, selectName: string, optionName: string) {
  await actor.click(screen.getByRole('combobox', { name: selectName}))
  await actor.click(screen.getByRole('option', { name: optionName}))
}
describe('interview preparation', () => {
  it('requires a resume; assigning one in the dialog unlocks starting', async () => {
    const { actor, start, onPrepare, onSave, onStarted } = setup(null)
    const blocked = await screen.findByRole('button', { name: '开始面试' })
    expect((blocked as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('请选择有正文内容的简历。', { exact: false })).toBeTruthy()
    await actor.click(screen.getByRole('button', { name: '编辑环境 默认环境' }))
    await screen.findByRole('dialog', { name: '编辑面试准备' })
    await pickOption(actor, '环境简历', '开发简历')
    await actor.click(screen.getByRole('button', { name: '保存环境'}))
    expect(onSave).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const ready = await screen.findByRole('button', { name: '开始面试' })
    await waitFor(() => expect((ready as HTMLButtonElement).disabled).toBe(false))
    await actor.click(ready)
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
    expect(screen.getByText('暂无可用时长，可前往「购买时长」选择套餐。')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '准备面试' })).toBeTruthy()
    expect(start).not.toHaveBeenCalled()
  })
  it('new-preparation dialog gates save on name and has no delete action', async () => {
    const { actor, onSave } = setup()
    expect((await screen.findByRole('button', { name: '删除环境 默认环境' }) as HTMLButtonElement).disabled).toBe(true)
    const create = await screen.findByRole('button', { name: '新建面试准备' })
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false))
    await actor.click(create)
    const dialog = await screen.findByRole('dialog', { name: '新建面试准备' })
    expect(within(dialog).queryByRole('button', { name: /删除环境/ })).toBeNull()
    expect((within(dialog).getByRole('button', { name: '保存环境'}) as HTMLButtonElement).disabled).toBe(true)
    await actor.type(within(dialog).getByRole('textbox', { name: '环境名称' }), '新准备')
    await waitFor(() => expect((within(dialog).getByRole('button', { name: '保存环境'}) as HTMLButtonElement).disabled).toBe(false))
    await actor.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onSave).not.toHaveBeenCalled()
  })
  it('deleting a preparation from the card requires confirmation', async () => {
    const { actor, bridge } = setup('resume', 600, true)
    await actor.click(await screen.findByRole('button', { name: '删除环境 备用环境' }))
    const confirm = await screen.findByRole('dialog', { name: '删除环境' })
    expect(confirm.textContent).toContain('将删除「备用环境」')
    await actor.click(within(confirm).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(bridge.removeEnvironment).not.toHaveBeenCalled()
    await actor.click(screen.getByRole('button', { name: '删除环境 备用环境' }))
    await actor.click(within(await screen.findByRole('dialog', { name: '删除环境' })).getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(bridge.removeEnvironment).toHaveBeenCalledWith('env-2'))
  })
})
