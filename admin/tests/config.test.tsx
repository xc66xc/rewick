import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ConfigPage from '../src/pages/ConfigPage'
import { config, response } from './fixtures'
import { applyService, serviceForms } from '../src/hooks/unified-service'
function setup() {
  let saved = structuredClone(config)
  const bodies: typeof config[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(String(options.body)); bodies.push(body)
      saved = { ...body, version: saved.version + 1, providers: body.providers.map(({ apiKey, ...provider }: { apiKey?: string }) => ({ ...provider, hasApiKey: true })) }
    }
    return response(saved)
  }))
  const view = render(<ConfigPage api={new ApiClient('token')} />)
  return { bodies, view, actor: userEvent.setup() }
}
describe('unified model service forms', () => {
  it('adds all service kinds when HTTP does not provide randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const { actor } = setup()
    await screen.findByDisplayValue('快速模型')
    for (const name of ['添加回答模型', '添加语音转写', '添加远程知识库']) {
      await actor.click(screen.getByRole('button', { name }))
    }
    expect(screen.getAllByRole('form')).toHaveLength(4)
  })
  it('shows existing connection and model in one form and saves no other incomplete draft', async () => {
    const { actor, bodies } = setup()
    await screen.findByDisplayValue('快速模型')
    expect(screen.getAllByRole('form')).toHaveLength(1)
    expect(screen.getByLabelText('模型名称')).toHaveProperty('value', 'fast-model')
    expect(screen.queryByText('所属服务')).toBeNull()
    await actor.click(screen.getByRole('button', { name: '添加回答模型' }))
    const first = screen.getByRole('form', { name: '模型服务 快速模型' })
    await actor.clear(within(first).getByLabelText('显示名称'))
    await actor.type(within(first).getByLabelText('显示名称'), '更新名称')
    await actor.click(within(first).getByRole('button', { name: '保存' }))
    await screen.findByRole('status')
    expect(bodies[0].providers).toHaveLength(1)
    expect(bodies[0].models).toHaveLength(1)
    expect(bodies[0].models[0].name).toBe('更新名称')
    expect(screen.getAllByRole('form')).toHaveLength(2)
  })
  it('turns off the model and clears the last default in one save', async () => {
    const { actor, bodies } = setup()
    await screen.findByDisplayValue('快速模型')
    await actor.click(screen.getByRole('button', { name: '停用' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].models[0].enabled).toBe(false)
    expect(bodies[0].defaultModelId).toBe('')
    expect(await screen.findByRole('button', { name: '启用' })).toBeTruthy()
  })
  it('preserves draft and stored credentials after a version conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => response(options.method === 'PUT' ? { message: '版本冲突' } : config, options.method === 'PUT' ? 409 : 200)))
    const actor = userEvent.setup(); render(<ConfigPage api={new ApiClient('token')} />)
    await screen.findByDisplayValue('快速模型')
    await actor.type(screen.getByLabelText('API Key'), 'draft-secret')
    await actor.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain('版本冲突')
    expect(screen.getByLabelText('API Key')).toHaveProperty('value', 'draft-secret')
  })
  it('pairs a legacy connection with a new model and chooses an enabled default automatically', () => {
    const orphan = { ...config, models: [], defaultModelId: '' }
    const form = { ...serviceForms(orphan)[0], model: 'new-model', enabled: true }
    const value = applyService(orphan, form)
    expect(value.providers).toHaveLength(1)
    expect(value.models).toHaveLength(1)
    expect(value.defaultModelId).toBe(value.models[0].id)
  })
  it('does not disable siblings sharing a connection and requires a fresh key on URL changes', () => {
    const shared = { ...config, models: [...config.models, { ...config.models[0], id: 'second' }] }
    const item = serviceForms(shared)[0]
    const disabled = applyService(shared, { ...item, enabled: false })
    expect(disabled.models.find(row => row.id === 'second')?.enabled).toBe(true)
    expect(disabled.defaultModelId).toBe('second')
    expect(() => applyService(shared, { ...item, url: 'https://other.example/chat/completions' })).toThrow('重新填写')
  })
})
