import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ConfigPage from '../src/pages/ConfigPage'
import { config, data, response } from './fixtures'
describe('configuration drafts', () => {
  it('keeps a failed test and conflicted save draft including its key, until explicit server reload', async () => {
    const payloads: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => { if (url.endsWith('/test')) { payloads.push(data(options)); return response({ success: false, message: '模拟上游不可用', latencyMs: 7 }) } if (options.method === 'PUT') return response({ message: '配置版本冲突' }, 409); return response(config) }))
    const actor = userEvent.setup(); render(<ConfigPage api={new ApiClient('token')} />)
    const name = await screen.findByLabelText('服务名称'); await actor.clear(name); await actor.type(name, '尚未发布的新名称')
    await actor.type(screen.getByLabelText('API Key已保存'), 'draft-provider-key'); await actor.click(screen.getByRole('button', { name: '测试此模型' }))
    await screen.findByRole('alert'); expect(name).toHaveProperty('value', '尚未发布的新名称'); expect(screen.getByLabelText('API Key已保存')).toHaveProperty('value', 'draft-provider-key')
    expect(payloads[0]).toMatchObject({ capability: 'llm', modelId: 'model-1', config: { version: 1, providers: [{ apiKey: 'draft-provider-key' }] } })
    expect(JSON.stringify(payloads[0])).not.toContain('hasApiKey')
    await actor.click(screen.getByRole('button', { name: '发布配置' })); await screen.findByText('配置版本冲突')
    await actor.click(screen.getByRole('button', { name: '重新加载配置' })); await actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    expect(name).toHaveProperty('value', '尚未发布的新名称')
    await actor.click(screen.getByRole('button', { name: '重新加载配置' })); await actor.click(within(screen.getByRole('dialog')).getByRole('button', { name: '丢弃草稿并重新加载' }))
    expect(await screen.findByLabelText('服务名称')).toHaveProperty('value', '回答服务')
    expect(screen.getByLabelText('API Key已保存')).toHaveProperty('value', '')
  })
  it('clears keys on successful publish and when leaving the configuration page', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => response(options.method === 'PUT' ? { ...config, version: 2 } : config)))
    const api = new ApiClient('token'); const actor = userEvent.setup(); const view = render(<ConfigPage api={api} />)
    await actor.type(await screen.findByLabelText('API Key已保存'), 'secret-new-key'); await actor.click(screen.getByRole('button', { name: '发布配置' }))
    await screen.findByRole('status'); expect(screen.getByLabelText('API Key已保存')).toHaveProperty('value', '')
    await actor.type(screen.getByLabelText('API Key已保存'), 'another-key'); view.rerender(<ConfigPage api={api} active={false} />)
    await waitFor(() => expect(screen.getByLabelText('API Key已保存')).toHaveProperty('value', ''))
  })
  it('requires a new key for changed destinations and blocks removing referenced providers', async () => {
    const calls = vi.fn(async () => response(config)); vi.stubGlobal('fetch', calls)
    const actor = userEvent.setup(); render(<ConfigPage api={new ApiClient('token')} />)
    await screen.findByLabelText('服务名称'); await actor.click(screen.getByRole('button', { name: '移除服务' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '请先移除该服务的模型，或清除转写与知识库的服务关联。')
    expect(screen.queryByRole('dialog')).toBeNull()
    const url = screen.getByLabelText('请求地址'); await actor.clear(url); await actor.type(url, 'https://new-provider.example/chat/completions')
    expect(screen.getByLabelText('API Key已保存')).toHaveProperty('required', true)
    await actor.click(screen.getByRole('button', { name: '发布配置' })); expect(calls).toHaveBeenCalledTimes(1)
  })
})
