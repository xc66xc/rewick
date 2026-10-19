import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import DesktopSettingsPolicy from '../src/components/DesktopSettingsPolicy'
import { config, data, page, response, user } from './fixtures'
import type { Config } from '../src/types'

const defaults = { version: 2, llmModelId: 'model-1', temperature: 0.7, asrServiceId: 'asr-1' }
const platform: Config = {
  ...config,
  providers: [...config.providers,
    { id: 'asr-1', name: '平台转写', kind: 'asr', url: 'wss://example.test', enabled: true },
    { id: 'disabled', name: '已停用服务', kind: 'llm', url: 'https://example.test', enabled: false }],
  models: [...config.models,
    { ...config.models[0], id: 'hidden-1', name: '已停用模型', enabled: false },
    { ...config.models[0], id: 'hidden-2', name: '已停用服务的模型', providerId: 'disabled' }],
  asr: { enabled: true, providerId: 'asr-1', model: 'paraformer' },
}

function setupFetch(save?: (body: Record<string, unknown>) => Response) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith('/desktop-settings/users')) return response([])
    if (options.method === 'PUT') {
      const body = data(options); requests.push({ url, body })
      return save ? save(body) : response({ ...body, version: 3 })
    }
    return response(defaults)
  }))
  return requests
}

describe('desktop advanced settings policy', () => {
  it('selects only enabled services and saves defaults independently', async () => {
    const requests = setupFetch()
    const actor = userEvent.setup()
    render(<DesktopSettingsPolicy api={new ApiClient('test')} config={platform} />)
    const model = await screen.findByLabelText('默认回答模型')
    expect(screen.queryByLabelText('默认检索方式')).toBeNull()
    expect(screen.queryByLabelText('默认远程知识库')).toBeNull()
    expect(within(model).queryByRole('option', { name: '已停用模型' })).toBeNull()
    expect(within(model).queryByRole('option', { name: '已停用服务的模型' })).toBeNull()
    await actor.clear(screen.getByLabelText('默认生成温度'))
    await actor.type(screen.getByLabelText('默认生成温度'), '1')
    await actor.click(screen.getByRole('button', { name: '保存默认服务' }))
    expect((await screen.findByRole('status')).textContent).toContain('默认服务已保存')
    expect(requests).toEqual([{ url: '/api/v1/admin/desktop-settings', body: { ...defaults, temperature: 1 } }])
  })

  it('preserves defaults after a failed save and shows the server correction', async () => {
    setupFetch(() => response({ message: '默认服务版本已更新，请重新加载。' }, 409))
    const actor = userEvent.setup()
    render(<DesktopSettingsPolicy api={new ApiClient('test')} config={platform} />)
    await screen.findByLabelText('默认回答模型')
    await actor.clear(screen.getByLabelText('默认生成温度'))
    await actor.type(screen.getByLabelText('默认生成温度'), '1')
    await actor.click(screen.getByRole('button', { name: '保存默认服务' }))
    expect((await screen.findByRole('alert')).textContent).toContain('版本已更新')
    expect(screen.getByLabelText('默认生成温度')).toHaveProperty('value', '1')
  })

  it('searches existing users and grants then removes one user independently', async () => {
    let granted = false
    const mutations: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes('/desktop-settings/users/2')) { granted = data(options).enabled === true; mutations.push(data(options)); return new Response(null, { status: 204 }) }
      if (url.endsWith('/desktop-settings/users')) return response(granted ? [{ id: '2', displayName: 'Candidate', email: 'candidate@example.test' }] : [])
      if (url.includes('/admin/users?')) { expect(url).toContain('query=candidate%40example.test'); return response(page([{ ...user, displayName: 'Candidate', email: 'candidate@example.test' }])) }
      return response(defaults)
    }))
    const actor = userEvent.setup()
    render(<DesktopSettingsPolicy api={new ApiClient('test')} config={platform} />)
    await screen.findByText('暂未添加授权用户。')
    await actor.type(screen.getByLabelText('搜索授权用户'), 'candidate@example.test')
    await actor.click(screen.getByRole('button', { name: '搜索已有用户' }))
    await actor.click(await screen.findByRole('button', { name: '添加权限 Candidate' }))
    const remove = await screen.findByRole('button', { name: '移除权限 Candidate' })
    expect(screen.getByRole('table', { name: '高级设置授权列表' }).textContent).toContain('candidate@example.test')
    expect(screen.getByRole('button', { name: '添加权限 Candidate' })).toHaveProperty('disabled', true)
    await actor.click(remove)
    await screen.findByText('暂未添加授权用户。')
    expect(mutations).toEqual([{ enabled: true }, { enabled: false }])
  })

  it('keeps an authorized user visible if revoking fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'PUT') return response({ message: '授权更新失败' }, 500)
      if (url.endsWith('/desktop-settings/users')) return response([{ id: '2', displayName: 'Candidate', email: null }])
      return response(defaults)
    }))
    const actor = userEvent.setup()
    render(<DesktopSettingsPolicy api={new ApiClient('test')} config={platform} />)
    await actor.click(await screen.findByRole('button', { name: '移除权限 Candidate' }))
    expect((await screen.findByRole('alert')).textContent).toContain('授权更新失败')
    await waitFor(() => expect(screen.getByRole('button', { name: '移除权限 Candidate' })).toHaveProperty('disabled', false))
    expect(screen.getByText('未绑定邮箱')).toBeTruthy()
  })
})
