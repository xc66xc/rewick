// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/renderer/src/App'
import { defaultSettings } from '../src/shared/defaults'
import type { AppEvent, DesktopBridge, Settings, SettingsInput } from '../src/shared/types'

function account(id = 'first'): Settings & { platform: NonNullable<Settings['platform']> } {
  return { ...structuredClone(defaultSettings), platform: { enabled: true, baseUrl: 'http://127.0.0.1:8080', authenticated: true,
    user: { id, displayName: `${id}@example.test`, email: `${id}@example.test` },
    capabilities: { llm: true, asr: true, knowledge: true }, models: { llm: 'fast', asr: 'asr' },
    services: { asr: [{ id: 'asr', name: '平台转写' }], knowledge: [{ id: 'rag', name: '平台知识库' }] } } }
}
function setup(initial = structuredClone(defaultSettings), strict = false) {
  let current = initial
  const listeners = new Set<(event: AppEvent) => void>()
  const getHistory = vi.fn(async () => [])
  const getSettings = vi.fn(async () => current)
  const saveSettings = vi.fn(async (input: SettingsInput) => { current = { ...current, platform: { ...account().platform, ...current.platform, ...input.platform } }; return current })
  const platformLogin = vi.fn(async () => { current = account(); return current })
  const platformRegister = vi.fn(async () => { current = account('registered'); return current })
  const platformLogout = vi.fn(async () => { current = { ...current, platform: { ...account().platform, authenticated: false } }; return current })
  const refreshPlatform = vi.fn(async () => current)
  const requestEmailCode = vi.fn(async () => ({ retryAfterSeconds: 60, expiresInSeconds: 600 }))
  const requestPasswordResetCode = vi.fn(async () => ({ retryAfterSeconds: 60, expiresInSeconds: 600 }))
  const resetPassword = vi.fn(async () => undefined)
  const nativeWindow = { compact: false, pinned: false }
  const setCompact = vi.fn(async (value: boolean) => { nativeWindow.compact = value })
  const setAlwaysOnTop = vi.fn(async (value: boolean) => { nativeWindow.pinned = value; return value })
  const stopAsr = vi.fn(async () => undefined)
  const cancelAnswer = vi.fn(async () => undefined)
  const library = { resumes: [{ id: 'resume', name: '测试简历', text: '测试候选人简历', createdAt: '', updatedAt: '' }], targets: [], environments: [{ id: 'env', name: '默认环境', resumeId: 'resume', targetId: null, referenceIds: [], createdAt: '', updatedAt: '' }], activeEnvironmentId: 'env' }
  const wallet = { availableSeconds: 3600, version: 0, serverTime: new Date().toISOString(), session: null }
  const getWallet = vi.fn(async () => wallet)
  const startInterview = vi.fn(async () => ({ ...wallet, session: { id: 'session', status: 'active', startedAt: wallet.serverTime, expiresAt: new Date(Date.now() + 30000).toISOString(), endedAt: null, usedSeconds: 0, endReason: null } }))
  const endInterview = vi.fn(async () => wallet)
  const bridge = { getSettings, saveSettings, platformLogin, platformLogout, platformRegister, refreshPlatform, requestEmailCode, requestPasswordResetCode, resetPassword,
    getWallet, startInterview, endInterview, getInterviewLibrary: vi.fn(async () => library), listReferences: vi.fn(async () => []), saveEnvironment: vi.fn(async () => library), activateEnvironment: vi.fn(async () => current),
    getHistory, stopAsr, cancelAnswer, setCompact, setAlwaysOnTop, saveSession: vi.fn(async () => undefined),
    onEvent: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  } as unknown as DesktopBridge
  const mount = () => render(strict ? <StrictMode><App bridge={bridge} /></StrictMode> : <App bridge={bridge} />)
  function change(settings: Settings) { current = settings; act(() => { for (const listener of listeners) listener({ kind: 'settings-changed' }) }) }
  return { mount, bridge, change, getHistory, getSettings, saveSettings, platformLogin, platformLogout, platformRegister, refreshPlatform, requestEmailCode, requestPasswordResetCode, resetPassword, stopAsr, cancelAnswer, nativeWindow, user: userEvent.setup() }
}
afterEach(() => { cleanup(); vi.useRealTimers() })
async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'first@example.test')
  await user.type(screen.getByLabelText('密码', { exact: true }), 'valid-test-password')
  await user.click(screen.getByRole('button', { name: '登录' }))
}

describe('desktop account gate', () => {
  it('loads no session data before login and saves only the public platform address before authentication', async () => {
    const { mount, user, getHistory, saveSettings, platformLogin } = setup()
    mount()
    expect(await screen.findByRole('heading', { name: '登录面试工作台' })).toBeTruthy()
    expect(screen.queryByLabelText('平台服务地址')).toBeNull()
    expect(screen.queryByText('平台连接设置')).toBeNull()
    expect(getHistory).not.toHaveBeenCalled()
    await login(user)
    expect(await screen.findByRole('heading', { name: '准备面试' })).toBeTruthy()
    expect(platformLogin).toHaveBeenCalledWith({ identifier: 'first@example.test', password: 'valid-test-password' })
    expect(saveSettings.mock.calls[0][0].platform).toEqual({ enabled: true, baseUrl: 'http://127.0.0.1:8080' })
    expect(JSON.stringify(saveSettings.mock.calls)).not.toContain('valid-test-password')
    expect(getHistory).toHaveBeenCalled()
  })
  it('waits for successful startup refresh before mounting authenticated data hooks, including StrictMode', async () => {
    const { mount, refreshPlatform, getHistory } = setup(account(), true)
    let finish: (value: Settings) => void = () => undefined
    refreshPlatform.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    mount()
    await waitFor(() => expect(refreshPlatform).toHaveBeenCalled())
    expect(getHistory).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: '准备面试' })).toBeNull()
    await act(async () => finish(account()))
    expect(await screen.findByRole('heading', { name: '准备面试' })).toBeTruthy()
  })
  it('keeps the gate closed on startup refresh failure and allows explicit verification retry', async () => {
    const { mount, refreshPlatform, user, getHistory } = setup(account())
    refreshPlatform.mockRejectedValueOnce(new Error('平台连接暂时不可用'))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('平台连接暂时不可用')
    expect(getHistory).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '重新验证登录' }))
    expect(await screen.findByRole('heading', { name: '准备面试' })).toBeTruthy()
  })
  it('returns to the gate on settings authentication loss and clears the previous account question after another login', async () => {
    const { mount, user, change, platformLogin } = setup(account())
    mount()
    await user.click(await screen.findByRole('button', { name: '开始面试' }))
    const question = await screen.findByRole('textbox', { name: '当前问题' })
    await user.type(question, '上一账号尚未提交的问题')
    const loggedOut = account(); if (loggedOut.platform) loggedOut.platform.authenticated = false
    change(loggedOut)
    expect(await screen.findByRole('heading', { name: '登录面试工作台' })).toBeTruthy()
    platformLogin.mockImplementationOnce(async () => { const next = account('second'); change(next); return next })
    await login(user)
    await user.click(await screen.findByRole('button', { name: '开始面试' }))
    expect((await screen.findByRole('textbox', { name: '当前问题' }) as HTMLTextAreaElement).value).toBe('')
    expect(screen.getByRole('button', { name: '当前账号：second@example.test' })).toBeTruthy()
  })
  it('stops recording and cancels the answer before logout, without silently revalidating the account', async () => {
    const { mount, user, platformLogout, stopAsr, cancelAnswer, refreshPlatform } = setup(account())
    mount()
    await user.click(await screen.findByRole('button', { name: '退出登录' }))
    expect(await screen.findByRole('heading', { name: '登录面试工作台' })).toBeTruthy()
    expect(stopAsr.mock.invocationCallOrder[0]).toBeLessThan(platformLogout.mock.invocationCallOrder[0])
    expect(cancelAnswer.mock.invocationCallOrder[0]).toBeLessThan(platformLogout.mock.invocationCallOrder[0])
    expect(refreshPlatform).toHaveBeenCalledOnce()
  })
  it.each(['logout', 'expiry'] as const)('resets native compact/pinned state on %s before another account workbench mounts', async outcome => {
    const { mount, user, change, nativeWindow } = setup(account())
    mount()
    await user.click(await screen.findByRole('button', { name: '开始面试' }))
    await user.click(await screen.findByRole('button', { name: '紧凑模式' }))
    await user.click(screen.getByRole('button', { name: '窗口置顶' }))
    expect(nativeWindow).toEqual({ compact: true, pinned: true })
    if (outcome === 'logout') await user.click(screen.getByRole('button', { name: '退出登录' }))
    else { const expired = account(); expired.platform.expiresAt = new Date(Date.now() - 1).toISOString(); change(expired) }
    await screen.findByRole('heading', { name: '登录面试工作台' })
    await waitFor(() => expect(nativeWindow).toEqual({ compact: false, pinned: false }))
    await login(user)
    expect(await screen.findByRole('heading', { name: '准备面试' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '窗口置顶' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '紧凑模式' })).toBeTruthy()
    expect(nativeWindow).toEqual({ compact: false, pinned: false })
  })
  it('returns to login when the public token expiry passes', async () => {
    const { mount, change, platformLogout } = setup(account())
    mount()
    await screen.findByRole('heading', { name: '准备面试' })
    const expired = account(); if (expired.platform) expired.platform.expiresAt = new Date(Date.now() - 1).toISOString()
    change(expired)
    expect(await screen.findByRole('heading', { name: '登录面试工作台' })).toBeTruthy()
    await waitFor(() => expect(platformLogout).toHaveBeenCalledOnce())
  })
  it('refreshes periodically without dropping the workbench on a transient network error', async () => {
    const { mount, refreshPlatform } = setup(account())
    vi.useFakeTimers()
    mount()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByRole('heading', { name: '准备面试' })).toBeTruthy()
    refreshPlatform.mockRejectedValueOnce(new Error('temporary network failure'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(refreshPlatform).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: '准备面试' })).toBeTruthy()
  })
  it('sends an email verification code with a retry countdown, then registers without storing password/code in settings', async () => {
    const { mount, user, requestEmailCode, platformRegister, saveSettings, getHistory } = setup()
    mount()
    await user.click(await screen.findByRole('tab', { name: '注册账号' }))
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'new@example.test')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))
    await waitFor(() => expect(requestEmailCode).toHaveBeenCalledWith({ email: 'new@example.test' }))
    expect((await screen.findByRole('button', { name: '60 秒后重发' }) as HTMLButtonElement).disabled).toBe(true)
    expect(getHistory).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('密码', { exact: true }), 'register-test-password')
    await user.type(screen.getByRole('textbox', { name: '邮箱验证码' }), '123456')
    await user.click(screen.getByRole('button', { name: '注册并登录' }))
    expect(await screen.findByRole('heading', { name: '准备面试' })).toBeTruthy()
    expect(platformRegister).toHaveBeenCalledWith({ email: 'new@example.test', password: 'register-test-password', code: '123456' })
    expect(JSON.stringify(saveSettings.mock.calls)).not.toMatch(/register-test-password|123456/)
  })
  it('shows registered email guidance without claiming a code was sent and opens recovery', async () => {
    const { mount, user, requestEmailCode, getHistory } = setup()
    requestEmailCode.mockRejectedValueOnce(new Error('该邮箱已注册，如果该邮箱为您的邮箱，可以直接登录或找回密码。'))
    mount()
    await user.click(await screen.findByRole('tab', { name: '注册账号' }))
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'existing@example.test')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))
    expect((await screen.findByRole('alert')).textContent).toContain('该邮箱已注册')
    expect(screen.queryByText(/验证码已发送/)).toBeNull()
    await user.click(screen.getByRole('button', { name: '找回密码' }))
    expect(screen.getByRole('heading', { name: '找回密码' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '邮箱' }) as HTMLInputElement).value).toBe('existing@example.test')
    expect(getHistory).not.toHaveBeenCalled()
  })
  it('validates recovery passwords before sending, then resets and returns to login without persisting secrets', async () => {
    const { mount, user, requestPasswordResetCode, resetPassword, platformLogin, saveSettings, getHistory } = setup()
    mount()
    await user.click(await screen.findByRole('button', { name: '找回密码' }))
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'existing@example.test')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))
    expect((await screen.findByRole('alert')).textContent).toContain('至少 12')
    expect(requestPasswordResetCode).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('新密码', { exact: true }), 'new-secret-password')
    await user.type(screen.getByLabelText('确认密码', { exact: true }), 'different-password')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))
    expect((await screen.findByRole('alert')).textContent).toContain('不一致')
    expect(requestPasswordResetCode).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('确认密码', { exact: true }))
    await user.type(screen.getByLabelText('确认密码', { exact: true }), 'new-secret-password')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))
    expect(await screen.findByRole('button', { name: '60 秒后重发' })).toBeTruthy()
    expect(requestPasswordResetCode).toHaveBeenCalledWith({ email: 'existing@example.test' })
    await user.type(screen.getByRole('textbox', { name: '邮箱验证码' }), '654321')
    resetPassword.mockRejectedValueOnce(new Error('验证码错误，密码修改失败。'))
    await user.click(screen.getByRole('button', { name: '确认修改密码' }))
    expect((await screen.findByRole('alert')).textContent).toContain('密码修改失败')
    expect(screen.getByRole('heading', { name: '找回密码' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '确认修改密码' }))
    expect(await screen.findByRole('heading', { name: '登录面试工作台' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('密码修改成功')
    expect(resetPassword).toHaveBeenLastCalledWith({ email: 'existing@example.test', password: 'new-secret-password', code: '654321' })
    expect((screen.getByLabelText('密码', { exact: true }) as HTMLInputElement).value).toBe('')
    expect(JSON.stringify(saveSettings.mock.calls)).not.toMatch(/new-secret-password|654321/)
    expect(platformLogin).not.toHaveBeenCalled()
    expect(getHistory).not.toHaveBeenCalled()
  })

})
