import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ConfigPage from '../src/pages/ConfigPage'
import { applyService, serviceForms } from '../src/hooks/unified-service'
import { mergeRecord, recordPayload } from '../src/hooks/config-record'
import { configPayload, configSchema, defaultWebSearch, type Config } from '../src/types'
import { config, response } from './fixtures'
const searchConfig: Config = { ...config, providers: [...config.providers, { id: 'tavily', name: 'Tavily', kind: 'web-search', url: 'https://api.tavily.com/search', enabled: true, hasApiKey: true }], webSearch: { enabled: true, providerId: 'tavily', topK: 7, searchDepth: 'basic', timeoutMs: 10000, includeAnswer: 'advanced' } }
function setup(initial = config) {
  let saved = structuredClone(initial)
  const publications: Config[] = []
  const tests: { config: Config; capability: string; modelId?: string }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith('/test')) { tests.push(JSON.parse(String(options.body))); return response({ success: true, message: '连接成功', latencyMs: 5 }) }
    if (options.method === 'PUT') {
      const body: Config = JSON.parse(String(options.body)); publications.push(body)
      saved = { ...body, version: saved.version + 1, providers: body.providers.map(({ apiKey: _key, ...provider }) => ({ ...provider, hasApiKey: true })) }
    }
    return response(saved)
  }))
  render(<ConfigPage api={new ApiClient('test-token')} />)
  return { actor: userEvent.setup(), publications, tests }
}
describe('Tavily management configuration', () => {
  it('defaults legacy API responses to disabled search and validates parameter bounds', () => {
    const { webSearch: _missing, ...legacy } = config
    expect(configSchema.parse(legacy).webSearch).toEqual(defaultWebSearch)
    const { includeAnswer: _missingMode, ...legacySearch } = searchConfig.webSearch
    expect(configSchema.parse({ ...searchConfig, webSearch: legacySearch }).webSearch.includeAnswer).toBe('none')
    expect(configSchema.parse(searchConfig).webSearch.includeAnswer).toBe('advanced')
    for (const patch of [{ topK: 0 }, { topK: 21 }, { topK: 1.5 }, { timeoutMs: 999 }, { timeoutMs: 30001 }, { searchDepth: 'quick' }, { includeAnswer: 'fast' }]) {
      expect(configSchema.safeParse({ ...config, webSearch: { ...defaultWebSearch, ...patch } }).success).toBe(false)
    }
  })
  it.each([
    ['advanced', '高级搜索', 'basic'],
    ['basic', '基础搜索', 'fast'],
    ['fast', '快速搜索', 'ultra-fast'],
    ['ultra-fast', '极速搜索', 'advanced'],
  ] as const)('displays %s and preserves the next depth through testing and saving', async (depth, label, nextDepth) => {
    const { actor, publications, tests } = setup({ ...searchConfig, webSearch: { ...searchConfig.webSearch, searchDepth: depth } })
    const overview = within(await screen.findByRole('article', { name: '服务 Tavily' }))
    expect(overview.getByText(label)).toBeTruthy()
    await actor.click(overview.getByRole('button', { name: '编辑配置' }))
    const draft = within(screen.getByRole('form', { name: '模型服务 Tavily' }))
    const selector = draft.getByLabelText('搜索深度')
    expect(selector).toHaveProperty('value', depth)
    expect(within(selector).getAllByRole('option').map(option => (option as HTMLOptionElement).value)).toEqual(['advanced', 'basic', 'fast', 'ultra-fast'])
    await actor.selectOptions(selector, nextDepth)
    await actor.click(draft.getByRole('button', { name: '测试连接' }))
    await waitFor(() => expect(tests).toHaveLength(1))
    expect(tests[0].config.webSearch.searchDepth).toBe(nextDepth)
    expect(publications).toHaveLength(0)
    await actor.click(draft.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(publications).toHaveLength(1))
    expect(publications[0].webSearch.searchDepth).toBe(nextDepth)
    expect(publications[0].webSearch.includeAnswer).toBe(searchConfig.webSearch.includeAnswer)
    expect(draft.getByLabelText('搜索深度')).toHaveProperty('value', nextDepth)
  })
  it('adds Tavily with its full search URL and publishes parameters without changing model services', async () => {
    const { actor, publications } = setup()
    await screen.findByRole('article', { name: '服务 快速模型' })
    await actor.click(screen.getByRole('button', { name: '添加服务' }))
    await actor.click(screen.getByRole('button', { name: '添加联网搜索' }))
    const draft = within(screen.getByRole('form', { name: '模型服务 新服务' }))
    expect(draft.queryByLabelText('模型名称')).toBeNull()
    expect(draft.getByLabelText('接口地址')).toHaveProperty('value', 'https://api.tavily.com/search')
    expect(draft.getByLabelText('保留网页数量（topK）')).toHaveProperty('value', '5')
    expect(draft.getByLabelText('包含摘要答案')).toHaveProperty('value', 'none')
    await actor.type(draft.getByLabelText('显示名称'), 'Tavily 搜索')
    await actor.type(draft.getByLabelText('API Key'), 'fake-test-search-key')
    await actor.clear(draft.getByLabelText('保留网页数量（topK）')); await actor.type(draft.getByLabelText('保留网页数量（topK）'), '3')
    await actor.selectOptions(draft.getByLabelText('搜索深度'), 'basic')
    await actor.selectOptions(draft.getByLabelText('包含摘要答案'), 'basic')
    await actor.clear(draft.getByLabelText('超时（毫秒）')); await actor.type(draft.getByLabelText('超时（毫秒）'), '5000')
    await actor.click(draft.getByRole('button', { name: '保存' }))
    await screen.findByRole('status')
    expect(publications[0].webSearch).toMatchObject({ enabled: true, topK: 3, searchDepth: 'basic', timeoutMs: 5000, includeAnswer: 'basic' })
    const provider = publications[0].providers.find(row => row.kind === 'web-search')
    expect(provider).toMatchObject({ url: 'https://api.tavily.com/search', apiKey: 'fake-test-search-key' })
    expect(publications[0].webSearch.providerId).toBe(provider?.id)
    expect(publications[0].models).toEqual(config.models)
    expect(publications[0].asr).toEqual(config.asr)
    const saved = within(screen.getByRole('form', { name: '模型服务 Tavily 搜索' }))
    expect(saved.getByLabelText('API Key')).toHaveProperty('value', '')
  })
  it('shows saved parameters, tests edits without publishing or modelId, and preserves a blank saved key', async () => {
    const { actor, publications, tests } = setup(searchConfig)
    const overview = within(await screen.findByRole('article', { name: '服务 Tavily' }))
    expect(overview.getByText('7 条')).toBeTruthy()
    expect(overview.getByText('基础搜索')).toBeTruthy()
    expect(overview.getByText('10000 ms')).toBeTruthy()
    expect(overview.getByText('高级摘要')).toBeTruthy()
    await actor.click(screen.getByRole('button', { name: '联网搜索' }))
    await actor.click(overview.getByRole('button', { name: '编辑配置' }))
    const draft = within(screen.getByRole('form', { name: '模型服务 Tavily' }))
    expect(draft.getByLabelText('API Key')).toHaveProperty('required', false)
    await actor.clear(draft.getByLabelText('保留网页数量（topK）')); await actor.type(draft.getByLabelText('保留网页数量（topK）'), '9')
    await actor.selectOptions(draft.getByLabelText('包含摘要答案'), 'advanced')
    await actor.click(draft.getByRole('button', { name: '测试连接' }))
    await screen.findByRole('status')
    expect(tests).toHaveLength(1)
    expect(tests[0]).toMatchObject({ capability: 'web-search', config: { webSearch: { providerId: 'tavily', topK: 9, includeAnswer: 'advanced' } } })
    expect(tests[0]).not.toHaveProperty('modelId')
    expect(tests[0].config.providers.find(row => row.id === 'tavily')).not.toHaveProperty('apiKey')
    expect(publications).toHaveLength(0)
    await actor.click(draft.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(publications).toHaveLength(1))
    expect(publications[0].webSearch.topK).toBe(9)
    expect(publications[0].webSearch.includeAnswer).toBe('advanced')
    expect(publications[0].providers.find(row => row.id === 'tavily')).not.toHaveProperty('apiKey')
  })
  it('disables and deletes the selected search service without clearing unrelated capabilities', async () => {
    const { actor, publications } = setup(searchConfig)
    const overview = within(await screen.findByRole('article', { name: '服务 Tavily' }))
    await actor.click(overview.getByRole('button', { name: '停用' }))
    await waitFor(() => expect(publications).toHaveLength(1))
    expect(publications[0].webSearch).toEqual({ ...searchConfig.webSearch, enabled: false })
    expect(publications[0].providers.find(row => row.id === 'tavily')?.enabled).toBe(false)
    await actor.click(overview.getByRole('button', { name: '删除' }))
    await actor.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(publications).toHaveLength(2))
    expect(publications[1].webSearch.providerId).toBe('')
    expect(publications[1].providers).toEqual(configPayload(config).providers)
    expect(publications[1].models).toEqual(config.models)
  })
  it('blocks invalid form parameters and requires reentry after changing an endpoint', async () => {
    const { actor, publications } = setup(searchConfig)
    await actor.click(within(await screen.findByRole('article', { name: '服务 Tavily' })).getByRole('button', { name: '编辑配置' }))
    const draft = within(screen.getByRole('form', { name: '模型服务 Tavily' }))
    await actor.clear(draft.getByLabelText('保留网页数量（topK）')); await actor.type(draft.getByLabelText('保留网页数量（topK）'), '21')
    await actor.click(draft.getByRole('button', { name: '保存' }))
    expect(publications).toHaveLength(0)
    await actor.clear(draft.getByLabelText('接口地址')); await actor.type(draft.getByLabelText('接口地址'), 'https://search.example/search')
    expect(draft.getByLabelText('API Key')).toHaveProperty('required', true)
  })
  it('retains the selected service when editing another capability and binds a second search only on activation', () => {
    const editedModel = { ...serviceForms(searchConfig)[0], name: '新模型名称' }
    expect(applyService(searchConfig, editedModel).webSearch).toEqual(searchConfig.webSearch)
    const other = { ...serviceForms(searchConfig).find(row => row.kind === 'web-search'), id: 'other', providerId: 'other', kind: 'web-search' as const, name: '第二服务', model: '', url: 'https://other.example/search', enabled: false, topK: 2, searchDepth: 'advanced' as const, timeoutMs: 3000, includeAnswer: 'none' as const, maxOutputTokens: 2048, dimensions: 1024 }
    expect(() => applyService(searchConfig, other)).toThrow('启用此项以切换')
    const activated = applyService(searchConfig, { ...other, enabled: true })
    expect(activated.webSearch).toEqual({ enabled: true, providerId: 'other', topK: 2, searchDepth: 'advanced', timeoutMs: 3000, includeAnswer: 'none' })
    expect(serviceForms(activated).find(row => row.providerId === 'tavily')?.enabled).toBe(false)
    expect(serviceForms(activated).find(row => row.providerId === 'other')?.topK).toBe(2)
    const original = serviceForms(activated).find(row => row.providerId === 'tavily')
    if (!original) throw new Error('Missing test search service')
    expect(applyService(activated, original, true).webSearch).toEqual(activated.webSearch)
  })
  it('preserves web search through isolated record saves, merges and credential cleanup', () => {
    const draft = { ...searchConfig, providers: searchConfig.providers.map(provider => ({ ...provider, name: 'draft-name' })) }
    const payload = recordPayload(searchConfig, draft, { kind: 'providers', id: 'service-1' })
    expect(payload.webSearch).toEqual(searchConfig.webSearch)
    expect(configPayload(payload).webSearch).toEqual(searchConfig.webSearch)
    const merged = mergeRecord(draft, { ...payload, version: 3 }, searchConfig, { kind: 'providers', id: 'service-1' })
    expect(merged.webSearch).toEqual(searchConfig.webSearch)
    expect(() => applyService(searchConfig, { ...serviceForms(searchConfig)[0], kind: 'web-search' })).toThrow('重新填写')
  })
})
