// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsDialog from '../src/renderer/src/components/SettingsDialog'
import { defaultSettings } from '../src/shared/defaults'
import type { CustomServiceInput, DesktopBridge, Settings, SettingsInput } from '../src/shared/types'
import { isAnswerModelReady, isAsrReady, usesPlatformAnswer } from '../src/renderer/src/hooks/useAutoAnswer'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => cleanup())
function platformSettings(): Settings & { platform: NonNullable<Settings['platform']> } {
  return { ...structuredClone(defaultSettings), platform: {
    enabled: true, baseUrl: 'http://127.0.0.1:8080', authenticated: true,
    user: { id: '1', displayName: 'tester', email: 'tester@example.test' },
    capabilities: { llm: true, asr: true, knowledge: true }, models: { llm: 'fast', asr: 'platform-asr', available: [{ id: 'fast', name: '快速回答' }, { id: 'careful', name: '深度回答' }] },
    services: { asr: [{ id: 'speech', name: '平台转写' }], knowledge: [{ id: 'rag', name: '平台知识库' }], embedding: [] },
  } }
}
function setup(settings = platformSettings()) {
  const onSave = vi.fn(async (input: SettingsInput): Promise<Settings> => ({ ...settings, ...input, llm: { ...settings.llm, ...input.llm }, asr: { ...settings.asr, ...input.asr }, embedding: settings.embedding, remoteKnowledge: { ...settings.remoteKnowledge, ...input.remoteKnowledge }, platform: settings.platform }))
  const testCustomService = vi.fn(async () => ({ latencyMs: 12, message: '连接成功' }))
  const saveCustomService = vi.fn(async (input: CustomServiceInput): Promise<Settings> => ({ ...settings,
    customServices: [...settings.customServices ?? [], { ...input, id: input.id || 'new-service', hasApiKey: Boolean(input.apiKey) }],
    serviceSelections: { ...settings.serviceSelections, [input.kind]: { source: 'custom', id: input.id || 'new-service' } },
  }))
  const removeCustomService = vi.fn(async (id: string): Promise<Settings> => ({ ...settings, customServices: settings.customServices?.filter(value => value.id !== id) }))
  const onLogout = vi.fn(async () => undefined)
  const onApply = vi.fn()
  const bridge = { testCustomService, saveCustomService, removeCustomService, refreshPlatform: vi.fn(async () => settings) } as unknown as DesktopBridge
  render(<SettingsDialog settings={settings} bridge={bridge} onSave={onSave} onApply={onApply} onLogout={onLogout} onClose={vi.fn()} />)
  return { onSave, onApply, testCustomService, saveCustomService, removeCustomService, onLogout, user: userEvent.setup() }
}
async function openCustom(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole('combobox', { name: '回答模型' }), 'new')
  const dialog = within(screen.getByRole('dialog', { name: '添加回答模型' }))
  await user.type(dialog.getByRole('textbox', { name: '配置名称' }), '我的回答服务')
  await user.type(dialog.getByLabelText('API Key'), 'draft-key-test-only')
  return dialog
}
describe('grouped service settings', () => {
  it('groups platform/custom services and explicitly chooses platform despite an old saved Key', async () => {
    const settings = platformSettings(); settings.llm.hasApiKey = true
    const { user, onSave } = setup(settings)
    const select = screen.getByRole('combobox', { name: '回答模型' })
    expect(within(select).getByRole('group', { name: '平台提供' })).toBeTruthy()
    expect(within(select).getByRole('group', { name: '我的自定义' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: '启用平台服务' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '回答 API 地址' })).toBeNull()
    await user.selectOptions(select, 'platform:careful')
    await user.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].serviceSelections?.llm).toEqual({ source: 'platform', id: 'careful' })
    expect(onSave.mock.calls[0][0].llm.apiKey).toBeUndefined()
  })
  it('tests the current custom draft without persisting it and cancel keeps the original selection', async () => {
    const { user, onSave, testCustomService, saveCustomService } = setup()
    const dialog = await openCustom(user)
    await user.click(dialog.getByRole('button', { name: '测试连接' }))
    expect((await dialog.findByRole('status')).textContent).toContain('测试未保存配置')
    expect(testCustomService.mock.calls[0]).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled(); expect(saveCustomService).not.toHaveBeenCalled()
    expect((dialog.getByLabelText('API Key') as HTMLInputElement).value).toBe('draft-key-test-only')
    await user.click(dialog.getByRole('button', { name: '取消' }))
    expect((screen.getByRole('combobox', { name: '回答模型' }) as HTMLSelectElement).value).toBe('platform:fast')
    expect(screen.queryByLabelText('API Key')).toBeNull()
  })
  it('preserves failed drafts for retry, then saves and selects the new custom profile without losing preference edits', async () => {
    const { user, onSave, saveCustomService } = setup()
    await user.selectOptions(screen.getByRole('combobox', { name: '回答风格' }), 'detailed')
    const dialog = await openCustom(user)
    saveCustomService.mockRejectedValueOnce(new Error('连接配置未保存，请重试'))
    await user.click(dialog.getByRole('button', { name: '保存并选用' }))
    expect((await dialog.findByRole('alert')).textContent).toContain('请重试')
    expect((dialog.getByLabelText('API Key') as HTMLInputElement).value).toBe('draft-key-test-only')
    await user.click(dialog.getByRole('button', { name: '保存并选用' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '添加回答模型' })).toBeNull())
    expect((screen.getByRole('combobox', { name: '回答模型' }) as HTMLSelectElement).value).toBe('custom:new-service')
    expect((screen.getByRole('combobox', { name: '回答风格' }) as HTMLSelectElement).value).toBe('detailed')
    expect(screen.getByRole('button', { name: '编辑回答模型' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].serviceSelections?.llm).toEqual({ source: 'custom', id: 'new-service' })
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('draft-key-test-only')
  })
  it('confirms deletion and keeps a removed selection unavailable until explicitly replaced', async () => {
    const settings = platformSettings()
    settings.customServices = [{ id: 'own', kind: 'llm', name: '私人服务', url: 'https://example.test/v1', model: 'own-model', hasApiKey: true }]
    settings.serviceSelections = { llm: { source: 'custom', id: 'own' } }
    const { user, removeCustomService } = setup(settings)
    await user.click(screen.getByRole('button', { name: '删除回答模型' }))
    const dialog = within(screen.getByRole('dialog', { name: '删除自定义服务' }))
    expect(dialog.getByText(/私人服务/).textContent).toContain('不会自动切换到平台')
    await user.click(dialog.getByRole('button', { name: '取消' }))
    expect(removeCustomService).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '删除回答模型' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    expect((await screen.findByRole('alert')).textContent).toContain('请明确选择')
    expect((screen.getByRole('combobox', { name: '回答模型' }) as HTMLSelectElement).value).toBe('custom:own')
  })
  it('saves knowledge enablement without provider fields and exposes account logout', async () => {
    const { user, onSave, onLogout } = setup()
    await user.click(screen.getByRole('checkbox', { name: '启用远程知识库' }))
    await user.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].serviceSelections?.knowledge).toEqual({ source: 'platform', id: 'rag' })
    expect(onSave.mock.calls[0][0].remoteKnowledge).toMatchObject({ enabled: true, url: '', agentId: '' })
    expect(screen.getByText('tester')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '退出登录' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })
})
describe('explicit readiness', () => {
  it('uses explicit platform selection even when a personal Key exists', () => {
    const settings = platformSettings(); settings.llm.hasApiKey = true
    settings.serviceSelections = { llm: { source: 'platform', id: 'careful' } }
    expect(usesPlatformAnswer(settings)).toBe(true); expect(isAnswerModelReady(settings)).toBe(true)
    settings.platform.models.available = []
    expect(isAnswerModelReady(settings)).toBe(false)
  })
  it('never falls back to platform when a selected custom service is missing or lacks a Key', () => {
    const settings = platformSettings()
    settings.serviceSelections = { llm: { source: 'custom', id: 'missing' }, asr: { source: 'custom', id: 'missing' } }
    expect(isAnswerModelReady(settings)).toBe(false); expect(isAsrReady(settings)).toBe(false)
    settings.customServices = [{ id: 'missing', kind: 'llm', name: '本地模型', url: 'http://127.0.0.1:11434/v1', model: 'local', hasApiKey: false }]
    expect(isAnswerModelReady(settings)).toBe(true); expect(usesPlatformAnswer(settings)).toBe(false)
    settings.customServices.push({ id: 'local-asr', kind: 'asr', name: '本地转写', url: 'ws://127.0.0.1:8081/asr', model: 'asr', hasApiKey: false })
    settings.serviceSelections.asr = { source: 'custom', id: 'local-asr' }
    expect(isAsrReady(settings)).toBe(true)
  })
  it('retains backward-compatible readiness for settings without explicit selections', () => {
    const settings = platformSettings()
    expect(isAnswerModelReady(settings)).toBe(true); expect(isAsrReady(settings)).toBe(true)
    settings.llm.hasApiKey = true; expect(usesPlatformAnswer(settings)).toBe(false)
    settings.llm.hasApiKey = false; settings.platform.authenticated = false
    expect(isAnswerModelReady(settings)).toBe(false); expect(isAsrReady(settings)).toBe(false)
  })
})
