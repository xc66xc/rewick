import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import MockInterviewConfigPage from '../src/pages/MockInterviewConfigPage'
import MockWalletEditor from '../src/components/mock/MockWalletEditor'
import UsersPage from '../src/pages/UsersPage'
import { mockSettingsPayload, parseAllowedUsers } from '../src/mock-interviews'
import { config, data, page, response, user } from './fixtures'
const settings = { version: 1, enabled: false, allowedUserIds: [2], llmModelId: 'model-1', reportModelId: 'model-1', asrServiceId: 'asr-1', tts: { endpoint: 'wss://tts.example/ws', model: 'cosyvoice-v3-flash', hasApiKey: true, voiceId: 'longxiaochun', sampleRate: 24000 as const }, maxConcurrent: 2, maxFollowUps: 2, pauseMs: 1800, maxTtsCharacters: 12000, maxOutputTokens: 1024, dailySessionLimit: 10 }
const catalog = { ...config, providers: [...config.providers, { id: 'asr-1', name: '语音识别服务', kind: 'asr', enabled: true, url: 'wss://asr.example', hasApiKey: true }] }

describe('mock interview settings', () => {
  it('selects platform services and saves optimistic version without exposing or replacing saved keys', async () => {
    let payload: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'PUT') { payload = data(options); return response({ ...settings, ...payload, version: 2, tts: settings.tts }) }
      return response(url.endsWith('/admin/config') ? catalog : settings)
    }))
    const actor = userEvent.setup(); render(<MockInterviewConfigPage api={new ApiClient('token')} />)
    await screen.findByLabelText('主持模型')
    expect(screen.queryByLabelText('报告模型')).toBeNull()
    expect(screen.getByLabelText('TTS API Key')).toHaveProperty('value', '')
    expect(screen.getByLabelText('ASR 服务')).toHaveProperty('value', 'asr-1')
    await actor.clear(screen.getByLabelText('灰度用户 ID')); await actor.type(screen.getByLabelText('灰度用户 ID'), '2, 5, 5')
    await actor.click(screen.getByRole('button', { name: '保存模拟配置' }))
    await screen.findByText('模拟面试配置版本 2 已保存。')
    expect(payload).toMatchObject({ version: 1, allowedUserIds: [2, 5], tts: { endpoint: 'wss://tts.example/ws', sampleRate: 24000 } })
    expect(payload?.tts).not.toHaveProperty('hasApiKey')
    expect(payload?.tts).not.toHaveProperty('apiKey')
  })
  it('keeps the draft after version conflict and requires explicit reload', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => options.method === 'PUT' ? response({ message: '版本冲突' }, 409) : response(url.endsWith('/admin/config') ? catalog : settings)))
    const actor = userEvent.setup(); render(<MockInterviewConfigPage api={new ApiClient('token')} />)
    await actor.type(await screen.findByLabelText('TTS API Key'), 'new-secret')
    await actor.click(screen.getByRole('button', { name: '保存模拟配置' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('TTS API Key')).toHaveProperty('value', 'new-secret')
    expect(screen.getByRole('button', { name: '保存模拟配置' })).toHaveProperty('disabled', true)
    await actor.click(screen.getByRole('button', { name: '重新加载模拟配置' }))
    await actor.click(screen.getByRole('button', { name: '丢弃草稿并重新加载' }))
    await waitFor(() => expect(screen.getByLabelText('TTS API Key')).toHaveProperty('value', ''))
  })
  it('only calls TTS provider test after an explicit action and never publishes it', async () => {
    const mutations: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => { if (options.method === 'POST') { mutations.push(url); return response({ success: true, message: '连接成功' }) } return response(url.endsWith('/admin/config') ? catalog : settings) }))
    const actor = userEvent.setup(); render(<MockInterviewConfigPage api={new ApiClient('token')} />)
    await screen.findByLabelText('主持模型'); expect(mutations).toHaveLength(0)
    await actor.click(screen.getByRole('button', { name: '测试 TTS 连接' }))
    await screen.findByText(/连接成功。测试会合成/)
    expect(mutations).toEqual(['/api/v1/admin/mock-interviews/settings/test'])
  })
  it('rejects malformed graylist and removes only secret presence metadata', () => {
    expect(parseAllowedUsers('2,3\n2')).toEqual([2, 3]); expect(parseAllowedUsers('-1')).toBeNull(); expect(parseAllowedUsers('abc')).toBeNull()
    expect(mockSettingsPayload({ ...settings, tts: { ...settings.tts, apiKey: ' new-key ' } }).tts).toMatchObject({ apiKey: 'new-key' })
  })
})

describe('independent mock wallet', () => {
  it('uses its dedicated adjustment endpoint and reuses the request id after uncertain failure', async () => {
    const mutations: Record<string, unknown>[] = []
    const saved = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toContain('/mock-wallet')
      if (options.method === 'POST') { mutations.push(data(options)); return mutations.length === 1 ? response({ message: '临时失败' }, 503) : response({ availableSeconds: 4200, version: 2 }) }
      return response({ availableSeconds: 3600, version: 1 })
    }))
    const actor = userEvent.setup(); render(<MockWalletEditor api={new ApiClient('token')} user={user} onSaved={saved} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByLabelText('小时')
    await actor.clear(within(dialog).getByLabelText('分钟')); await actor.type(within(dialog).getByLabelText('分钟'), '10')
    await actor.type(within(dialog).getByLabelText('调整原因'), '测试练习额度')
    await actor.click(within(dialog).getByRole('button', { name: '保存模拟时长' }))
    await within(dialog).findByRole('alert')
    await actor.click(within(dialog).getByRole('button', { name: '保存模拟时长' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(mutations).toHaveLength(2); expect(mutations[0]).toEqual(mutations[1]); expect(mutations[0]).toMatchObject({ deltaSeconds: 600, reason: '测试练习额度' })
    expect(mutations[0]).not.toHaveProperty('operation')
  })
  it('shows independent balance in user management and opens a separate editor', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/mock-wallet') ? { availableSeconds: 1800, version: 1 } : page([user]))))
    const actor = userEvent.setup(); render(<UsersPage api={new ApiClient('token')} />)
    expect(await screen.findByRole('columnheader', { name: '模拟可用时长' })).toBeTruthy()
    await screen.findByText('0 小时 30 分 0 秒')
    await actor.click(screen.getByRole('button', { name: '更多操作 candidate' })); await actor.click(screen.getByRole('button', { name: '调整模拟时长 candidate' }))
    expect(screen.getByRole('dialog', { name: '调整模拟时长 · candidate' })).toBeTruthy()
  })
})
