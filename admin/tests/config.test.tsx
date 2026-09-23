import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ConfigPage from '../src/pages/ConfigPage'
import { config, response } from './fixtures'
import { allowsBlankServiceKey, applyService, serviceForms } from '../src/hooks/unified-service'
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
  it('filters summaries and cancels editing without saving', async () => {
    const { actor, bodies } = setup()
    await screen.findByRole('article', { name: '服务 快速模型' })
    expect(screen.queryByRole('form')).toBeNull()
    await actor.click(screen.getByRole('button', { name: '语音转写' }))
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('此分类尚无模型或服务，请添加。')).toBeTruthy()
    await actor.click(screen.getByRole('button', { name: '全部' }))
    await actor.click(screen.getByRole('button', { name: '编辑配置' }))
    await actor.clear(screen.getByLabelText('显示名称'))
    await actor.type(screen.getByLabelText('显示名称'), '未保存名称')
    await actor.click(screen.getByRole('button', { name: '取消编辑' }))
    expect(screen.getByRole('article', { name: '服务 快速模型' })).toBeTruthy()
    await actor.click(screen.getByRole('button', { name: '编辑配置' }))
    expect(screen.getByLabelText('显示名称')).toHaveProperty('value', '快速模型')
    expect(bodies).toHaveLength(0)
  })
  it('adds all service kinds when HTTP does not provide randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const { actor } = setup()
    await actor.click(await screen.findByRole('button', { name: '编辑配置' }))
    await screen.findByDisplayValue('快速模型')
    for (const name of ['添加回答模型', '添加语音转写', '添加远程知识库', '添加资料检索向量模型']) {
      await actor.click(screen.getByRole('button', { name: '添加服务' }))
      await actor.click(screen.getByRole('button', { name }))
    }
    expect(screen.getAllByRole('form')).toHaveLength(5)
  })
  it('saves, disables and deletes an embedding model using a single form', async () => {
    const { actor, bodies } = setup()
    await actor.click(await screen.findByRole('button', { name: '编辑配置' }))
    await screen.findByDisplayValue('快速模型')
    await actor.click(screen.getByRole('button', { name: '添加服务' }))
    await actor.click(screen.getByRole('button', { name: '添加资料检索向量模型' }))
    const draft = within(screen.getByRole('form', { name: '模型服务 新服务' }))
    await actor.type(draft.getByLabelText('显示名称'), '中文资料向量')
    await actor.type(draft.getByLabelText('模型名称'), 'text-embedding-v4')
    await actor.type(draft.getByLabelText('接口地址'), 'https://embedding.example/v1/embeddings')
    await actor.type(draft.getByLabelText('API Key'), 'test-embedding-key')
    expect(draft.getByRole('spinbutton', { name: /向量维度/ })).toHaveProperty('readOnly', true)
    expect(draft.getByRole('spinbutton', { name: /向量维度/ })).toHaveProperty('value', '1024')
    await actor.click(draft.getByRole('button', { name: '保存' }))
    await screen.findByRole('status')
    expect(bodies[0].embedding).toMatchObject({ enabled: true, model: 'text-embedding-v4', dimensions: 1024 })
    expect(bodies[0].providers.find(row => row.kind === 'embedding')).toMatchObject({ url: 'https://embedding.example/v1/embeddings', apiKey: 'test-embedding-key' })
    expect(bodies[0].models).toEqual(config.models)
    const saved = within(screen.getByRole('form', { name: '模型服务 中文资料向量' }))
    expect(saved.getByLabelText('API Key')).toHaveProperty('value', '')
    await actor.click(saved.getByRole('button', { name: '停用' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1].embedding.enabled).toBe(false)
    await actor.click(saved.getByRole('button', { name: '删除' }))
    await actor.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(bodies).toHaveLength(3))
    expect(bodies[2].embedding.providerId).toBe('')
    expect(bodies[2].providers.some(row => row.kind === 'embedding')).toBe(false)
  })
  it('allows keyless loopback embedding and requires a key when moving to a remote service', async () => {
    const { actor, bodies } = setup()
    await actor.click(await screen.findByRole('button', { name: '编辑配置' }))
    await screen.findByDisplayValue('快速模型')
    await actor.click(screen.getByRole('button', { name: '添加服务' }))
    await actor.click(screen.getByRole('button', { name: '添加资料检索向量模型' }))
    const draft = within(screen.getByRole('form', { name: '模型服务 新服务' }))
    await actor.type(draft.getByLabelText('显示名称'), '本机向量')
    await actor.type(draft.getByLabelText('模型名称'), 'text-embedding-v4')
    await actor.type(draft.getByLabelText('接口地址'), 'http://127.0.0.1:8000/v1/embeddings')
    expect(draft.getByLabelText('API Key')).toHaveProperty('required', false)
    await actor.click(draft.getByRole('button', { name: '保存' }))
    await screen.findByRole('status')
    expect(bodies[0].providers.find(row => row.kind === 'embedding')).not.toHaveProperty('apiKey')
    const saved = within(screen.getByRole('form', { name: '模型服务 本机向量' }))
    await actor.clear(saved.getByLabelText('接口地址'))
    await actor.type(saved.getByLabelText('接口地址'), 'https://embedding.example/v1/embeddings')
    expect(saved.getByLabelText('API Key')).toHaveProperty('required', true)
    await actor.click(saved.getByRole('button', { name: '保存' }))
    expect(bodies).toHaveLength(1)
  })
  it('limits blank credentials to embedding at exact supported loopback hosts', () => {
    for (const url of ['http://localhost:8000/embeddings', 'https://127.0.0.1/embeddings', 'http://[::1]:8000/embeddings']) {
      expect(allowsBlankServiceKey({ kind: 'embedding', url })).toBe(true)
      expect(allowsBlankServiceKey({ kind: 'llm', url })).toBe(false)
    }
    for (const url of ['https://localhost.example/embeddings', 'http://127.0.0.2/embeddings', 'http://localhost@remote.example/embeddings', 'wss://localhost/embeddings']) {
      expect(allowsBlankServiceKey({ kind: 'embedding', url })).toBe(false)
    }
    const form = { ...serviceForms(config)[0], kind: 'embedding' as const, url: 'http://localhost:8000/embeddings' }
    expect(() => applyService(config, form)).toThrow('重新填写')
    const newForm = { ...form, id: 'new-embedding', providerId: 'new-embedding' }
    expect(() => applyService(config, newForm)).not.toThrow()
    expect(() => applyService(config, { ...form, url: 'https://remote.example/embeddings' })).toThrow('重新填写')
  })
  it('tests an embedding draft without saving or sending another capability', async () => {
    const calls: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/test')) { calls.push(JSON.parse(String(options.body))); return response({ success: true, message: '连接成功', latencyMs: 10 }) }
      return response(config)
    }))
    const actor = userEvent.setup()
    render(<ConfigPage api={new ApiClient('token')} />)
    await actor.click(await screen.findByRole('button', { name: '编辑配置' }))
    await screen.findByDisplayValue('快速模型')
    await actor.click(screen.getByRole('button', { name: '添加服务' }))
    await actor.click(screen.getByRole('button', { name: '添加资料检索向量模型' }))
    const draft = within(screen.getByRole('form', { name: '模型服务 新服务' }))
    await actor.type(draft.getByLabelText('显示名称'), '测试向量')
    await actor.type(draft.getByLabelText('模型名称'), 'text-embedding-v4')
    await actor.type(draft.getByLabelText('接口地址'), 'https://embedding.example/v1/embeddings')
    await actor.type(draft.getByLabelText('API Key'), 'test-key')
    await actor.click(draft.getByRole('button', { name: '测试连接' }))
    expect((await screen.findByRole('status')).textContent).toContain('未保存')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ capability: 'embedding', config: { embedding: { model: 'text-embedding-v4', dimensions: 1024 } } })
    expect(calls[0]).not.toHaveProperty('modelId')
    expect(draft.getByLabelText('API Key')).toHaveProperty('value', 'test-key')
  })
  it('shows existing connection and model in one form and saves no other incomplete draft', async () => {
    const { actor, bodies } = setup()
    await actor.click(await screen.findByRole('button', { name: '编辑配置' }))
    await screen.findByDisplayValue('快速模型')
    expect(screen.getAllByRole('form')).toHaveLength(1)
    expect(screen.getByLabelText('模型名称')).toHaveProperty('value', 'fast-model')
    expect(screen.queryByText('所属服务')).toBeNull()
    await actor.click(screen.getByRole('button', { name: '添加服务' }))
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
    await actor.click(await screen.findByRole('button', { name: '编辑配置' }))
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
    await actor.click(await screen.findByRole('button', { name: '编辑配置' }))
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
