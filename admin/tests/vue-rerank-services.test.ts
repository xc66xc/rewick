import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ConfigPage from '../src/views/services/ConfigPage.vue'
import ReferencePolicy from '../src/components/services-rewick/ReferencePolicy.vue'
import { applyService, serviceForms, type ServiceForm } from '../src/hooks/unified-service'
import { configPayload, configSchema, defaultRerank } from '../src/types'
import { referencePolicySchema } from '../src/reference-policy'
import { eventSchema } from '../src/operations'
import { event } from './operations-fixtures'
import { config, data, response } from './fixtures'

const policy = { maxFiles: 20, maxTotalBytes: 104857600, maxChunks: 10000, childTarget: 600, childOverlap: 100, parentTarget: 1400, bm25K1: 1.2, bm25B: .75, vectorMinScore: .55, questionVectorMinScore: 0, rrfConstant: 60, bm25TimeoutMs: 300, maxTermRows: 2000000, cacheEnabled: false, cacheWeightBytes: 8388608, hybridEnabled: true, version: 3 }
const rerank: ServiceForm = { id: 'rerank-one', providerId: 'rerank-one', kind: 'rerank', name: '资料重排', url: 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank', model: 'qwen3-rerank', enabled: false, timeoutMs: 1500, topK: 5, searchDepth: 'advanced', includeAnswer: 'none', maxOutputTokens: 2048, dimensions: 1024 }

describe('configurable reference recall policy', () => {
  it('reads an old response as 4/4/2/2 and saves independent RRF and rerank counts', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') { writes.push(data(options)); return new Response(null, { status: 204 }) }
      return response(policy)
    }))
    render(ReferencePolicy, { props: { api: new ApiClient('test') } })
    const actor = userEvent.setup(), rrf = await screen.findByLabelText('RRF 保留数 TopN')
    expect(screen.getByLabelText('BM25 召回数')).toHaveProperty('value', '4')
    expect(screen.getByLabelText('向量召回数')).toHaveProperty('value', '4')
    expect(screen.getByLabelText('rerank 保留数 TopN（开启后生效）')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('rerank 保留数 TopN（开启后生效）')).toHaveProperty('disabled', false)
    await actor.clear(rrf); await actor.type(rrf, '6'); await actor.click(screen.getByRole('button', { name: '保存资料策略' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ version: 3, bm25TopK: 4, vectorTopK: 4, rrfTopN: 6, rerankTopN: 2 })
  })
  it('keeps an invalid draft without making a write when the two stages exceed their pool', async () => {
    const writes: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { if (options.method === 'PUT') writes.push(data(options)); return response(policy) }))
    render(ReferencePolicy, { props: { api: new ApiClient('test') } })
    const actor = userEvent.setup(), input = await screen.findByLabelText('rerank 保留数 TopN（开启后生效）')
    await actor.clear(input); await actor.type(input, '3'); await actor.click(screen.getByRole('button', { name: '保存资料策略' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('不能超过 RRF'))
    expect(writes).toHaveLength(0); expect(input).toHaveProperty('value', '3')
  })
  it.each([
    { bm25TopK: 0 }, { bm25TopK: 21 }, { vectorTopK: 1.5 }, { vectorTopK: 21 }, { rrfTopN: 0 }, { rrfTopN: 41 }, { rrfTopN: 9 }, { rerankTopN: 0 }, { rerankTopN: 21 }, { rerankTopN: 3 },
  ])('rejects illegal retrieval counts %j', counts => {
    expect(referencePolicySchema.safeParse({ ...policy, ...counts }).success).toBe(false)
  })
  it('accepts the maximum supported four-stage policy', () => {
    expect(referencePolicySchema.safeParse({ ...policy, bm25TopK: 20, vectorTopK: 20, rrfTopN: 40, rerankTopN: 20 }).success).toBe(true)
  })
})

describe('rerank service lifecycle', () => {
  it('retains the actual rerank model, reason and bounded configuration metadata in operation traces', () => {
    const observed = eventSchema.parse({ ...event, stage: 'retrieval.rerank', providerType: 'rerank', model: 'qwen3-rerank', outcome: 'skipped', reason: 'input_limit', metadata: { candidateCount: 40, selectedCount: 20, resultCount: 20, topK: 20, topN: 20, rrfTopN: 40, rerankTopN: 20, policyVersion: 3, platformVersion: 8 } })
    expect(observed).toMatchObject({ model: 'qwen3-rerank', providerType: 'rerank', reason: 'input_limit', metadata: { platformVersion: 8, policyVersion: 3, rrfTopN: 40, rerankTopN: 20 } })
  })
  it('reads old platform config disabled and retains rerank when saving another capability', () => {
    const { rerank: _rerank, ...legacy } = config
    expect(configSchema.parse(legacy).rerank).toEqual(defaultRerank)
    const saved = applyService(config, { ...rerank, enabled: true, apiKey: 'fixture-key' })
    const llm = serviceForms(saved).find(item => item.kind === 'llm')
    expect(llm).toBeDefined()
    if (!llm) throw new Error('Missing fixture model')
    expect(applyService(saved, { ...llm, maxOutputTokens: 3000 }).rerank).toEqual(saved.rerank)
    expect(JSON.stringify(configSchema.parse(saved))).not.toContain('fixture-key')
  })
  it('switches the single active binding and does not activate another provider after deletion', () => {
    const saved = configSchema.parse(applyService(config, { ...rerank, enabled: true, apiKey: 'fixture-key' }))
    const other = { ...rerank, id: 'rerank-two', providerId: 'rerank-two', name: '备用重排', enabled: true, apiKey: 'other-key' }
    const switched = applyService(saved, other)
    expect(serviceForms(switched).filter(item => item.kind === 'rerank' && item.enabled).map(item => item.id)).toEqual(['rerank-two'])
    expect(() => applyService(switched, { ...rerank, timeoutMs: 1000 })).toThrow('已有其他服务')
    expect(applyService(switched, other, true).rerank).toEqual(defaultRerank)
    expect(serviceForms(applyService(switched, other, true)).find(item => item.id === rerank.id)?.enabled).toBe(false)
  })
  it.each([299, 5001, 1500.5])('rejects invalid timeout %s before a request can be sent', timeoutMs => {
    expect(() => applyService(config, { ...rerank, timeoutMs })).toThrow()
  })
  it.each(['http://dashscope.example/api/rerank', 'https://dashscope.example', 'https://user:secret@dashscope.example/api/rerank', 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank'])('rejects incomplete or unsafe endpoint %s without filling a path', url => {
    expect(() => applyService(config, { ...rerank, url })).toThrow('完整 HTTPS')
  })
  it('saves a disabled service without a key and requires credentials before enabling', () => {
    const saved = applyService(config, rerank)
    expect(saved.rerank).toMatchObject({ enabled: false, model: 'qwen3-rerank', timeoutMs: 1500 })
    expect(() => applyService(saved, { ...rerank, enabled: true })).toThrow('API Key')
    expect(configPayload(saved).providers.find(item => item.kind === 'rerank')).not.toHaveProperty('hasApiKey')
  })
  it('blocks a missing final endpoint segment, then saves the complete official path and enables and tests the card without exposing the saved key', async () => {
    let current = structuredClone(config)
    const calls: { url: string; method: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'POST') { calls.push({ url, method: options.method, body: data(options) }); return response({ success: true, message: '样例测试成功', latencyMs: 5 }) }
      if (options.method === 'PUT') { const body = data(options); calls.push({ url, method: options.method, body }); current = configSchema.parse({ ...body, version: current.version + 1, providers: (body.providers as Record<string, unknown>[]).map(item => ({ ...item, hasApiKey: !!item.apiKey || !!current.providers.find(p => p.id === item.id)?.hasApiKey })) }); return response(current) }
      return response(current)
    }))
    render(ConfigPage, { props: { api: new ApiClient('test') } }); const actor = userEvent.setup()
    await screen.findByText('快速模型'); await actor.click(screen.getByRole('button', { name: '添加服务' })); await actor.click(screen.getByRole('button', { name: '添加重排序 Rerank' }))
    const form = screen.getByRole('form', { name: '模型服务 新服务' }), fields = within(form)
    expect(fields.getByLabelText('模型名称')).toHaveProperty('value', 'qwen3-rerank')
    expect(fields.getByLabelText('重排序超时（毫秒）')).toHaveProperty('value', '1500')
    const endpoint = fields.getByLabelText('接口地址')
    expect(endpoint).toHaveProperty('value', 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank')
    await actor.type(fields.getByLabelText('显示名称'), '重排服务')
    const incomplete = 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank'
    await actor.clear(endpoint); await actor.type(endpoint, incomplete)
    await actor.click(fields.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank'))
    expect(calls).toHaveLength(0)
    expect(endpoint).toHaveProperty('value', incomplete)
    await actor.clear(endpoint); await actor.type(endpoint, rerank.url)
    await actor.click(fields.getByRole('button', { name: '保存' })); await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body.rerank).toMatchObject({ enabled: false, model: 'qwen3-rerank', timeoutMs: 1500 })
    expect(calls[0].body.providers).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'rerank', url: 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank' })]))
    await actor.type(fields.getByLabelText('API Key'), 'fixture-private-key')
    // The saved card uses its separate enable action; edits are saved before toggling it.
    await actor.click(fields.getByRole('button', { name: '保存' })); await waitFor(() => expect(calls).toHaveLength(2))
    await actor.click(fields.getByRole('button', { name: '启用' })); await waitFor(() => expect(calls).toHaveLength(3))
    await actor.click(fields.getByRole('button', { name: '测试连接' })); await screen.findByText('样例测试成功，未保存配置。')
    expect(calls.filter(call => call.method === 'PUT')).toHaveLength(3)
    expect(calls[3]).toMatchObject({ url: '/api/v1/admin/config/test', body: { capability: 'rerank', config: { rerank: { enabled: true, model: 'qwen3-rerank' } } } })
    expect(fields.getByLabelText('API Key')).toHaveProperty('value', '')
    expect(document.body.textContent).not.toContain('fixture-private-key')
  })
})
