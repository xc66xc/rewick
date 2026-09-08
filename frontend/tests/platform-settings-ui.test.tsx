// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsDialog from '../src/renderer/src/components/SettingsDialog'
import { defaultSettings } from '../src/shared/defaults'
import type { DesktopBridge, Settings, SettingsInput } from '../src/shared/types'
import { isAnswerModelReady, isAsrReady, usesPlatformAnswer } from '../src/renderer/src/hooks/useAutoAnswer'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

function platformSettings(): Settings & { platform: NonNullable<Settings['platform']> } {
  return { ...structuredClone(defaultSettings), platform: {
    enabled: true, baseUrl: 'http://127.0.0.1:8080', authenticated: true,
    user: { id: '1', username: 'tester' }, expiresAt: new Date(Date.now() + 60000).toISOString(),
    capabilities: { llm: true, asr: true, knowledge: true }, models: { llm: 'platform-answer', asr: 'platform-asr' },
  } }
}

function setup(settings = structuredClone(defaultSettings)) {
  const saved: SettingsInput[] = []
  const onSave = vi.fn(async (input: SettingsInput): Promise<Settings> => { saved.push(input); return settings })
  const platformLogin = vi.fn(async () => platformSettings())
  const platformLogout = vi.fn(async () => ({ ...settings, platform: { ...platformSettings().platform, authenticated: false } }))
  const refreshPlatform = vi.fn(async () => platformSettings())
  const bridge = { platformLogin, platformLogout, refreshPlatform } as unknown as DesktopBridge
  render(<SettingsDialog settings={settings} bridge={bridge} onSave={onSave} onClose={vi.fn()} />)
  return { saved, onSave, platformLogin, platformLogout, refreshPlatform, user: userEvent.setup() }
}

describe('platform settings', () => {
  it('logs in without storing the password and retains unfinished model edits', async () => {
    const { user, saved, platformLogin } = setup()
    await user.click(screen.getByRole('checkbox', { name: '启用平台服务' }))
    const model = screen.getByRole('textbox', { name: '回答模型' })
    await user.clear(model)
    await user.type(model, 'unfinished-model')
    await user.type(screen.getByRole('textbox', { name: '平台账号' }), 'tester')
    await user.type(screen.getByLabelText('平台密码'), 'test-only-password')
    await user.click(screen.getByRole('button', { name: '连接并登录平台' }))

    await waitFor(() => expect(platformLogin).toHaveBeenCalledWith({ username: 'tester', password: 'test-only-password' }))
    expect((screen.getByRole('textbox', { name: '回答模型' }) as HTMLInputElement).value).toBe('unfinished-model')
    expect(JSON.stringify(saved)).not.toContain('test-only-password')
    await user.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(saved.at(-1)?.llm.model).toBe('unfinished-model'))
  })

  it('saves platform knowledge without requiring a provider URL, Agent ID or Key', async () => {
    const { user, saved } = setup(platformSettings())
    await user.click(screen.getByRole('checkbox', { name: '启用远程知识库' }))
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].remoteKnowledge).toMatchObject({ enabled: true, url: '', agentId: '' })
  })

  it('requires an explicit clear action before removing a saved personal Key', async () => {
    const settings = platformSettings()
    settings.llm.hasApiKey = true
    const { user, saved } = setup(settings)
    await user.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].llm.apiKey).toBeUndefined()
    await user.click(screen.getByRole('button', { name: '清除自带回答 Key' }))
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => expect(saved.at(-1)?.llm.apiKey).toBe(''))
  })

  it('shows public account capabilities and supports logout', async () => {
    const { user, platformLogout } = setup(platformSettings())
    expect(screen.getByText(/已登录：tester/).textContent).toContain('platform-answer')
    await user.click(screen.getByRole('button', { name: '退出平台账号' }))
    await waitFor(() => expect(platformLogout).toHaveBeenCalledOnce())
    expect(await screen.findByRole('button', { name: '连接并登录平台' })).toBeTruthy()
  })
})

describe('platform readiness and model selection', () => {
  it('allows automatic answers and ASR without personal Keys after platform login', () => {
    const settings = platformSettings()
    expect(isAnswerModelReady(settings)).toBe(true)
    expect(isAsrReady(settings)).toBe(true)
    expect(usesPlatformAnswer(settings)).toBe(true)
  })

  it('keeps personal and local models ahead of platform routing', () => {
    const settings = platformSettings()
    settings.llm.hasApiKey = true
    expect(usesPlatformAnswer(settings)).toBe(false)
    settings.llm.hasApiKey = false
    settings.llm.baseUrl = 'http://127.0.0.2:11434/v1'
    expect(usesPlatformAnswer(settings)).toBe(false)
    expect(isAnswerModelReady(settings)).toBe(true)
  })

  it('requires enabled, authenticated and available platform capabilities', () => {
    const settings = platformSettings()
    const platform = settings.platform
    if (!platform) throw new Error('Test account was not initialized')
    platform.authenticated = false
    expect(isAnswerModelReady(settings)).toBe(false)
    expect(isAsrReady(settings)).toBe(false)
    platform.authenticated = true
    platform.capabilities.llm = false
    expect(isAnswerModelReady(settings)).toBe(false)
    expect(isAsrReady(settings)).toBe(true)
  })
})
