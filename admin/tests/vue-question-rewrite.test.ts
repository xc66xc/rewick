import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import QuestionRewritePolicy from '../src/components/services-rewick/QuestionRewritePolicy.vue'
import ScreenshotModelPolicy from '../src/components/services-rewick/ScreenshotModelPolicy.vue'
import OperationTimeline from '../src/views/operations/OperationTimeline.vue'
import { configSchema, defaultQuestionRewrite, questionRewriteSchema } from '../src/types'
import { applyService, serviceForms } from '../src/hooks/unified-service'
import { recordPayload, mergeRecord } from '../src/hooks/config-record'
import { validateQuestionRewrite } from '../src/hooks/question-rewrite'
import { eventSchema } from '../src/operations'
import { config, data, response } from './fixtures'
import { event, trace } from './operations-fixtures'

const bound = { ...config, questionRewrite: { enabled: true, modelId: 'model-1', timeoutMs: 1500 } }
const originalQuestion = '嗯，多实例时一个任务点两次会不会执行两遍？Redis 锁过期了还没执行完怎么办？先不说跨地域。'
const rewrittenQuestion = '多实例部署下如何避免同一任务重复执行？Redis 锁过期但任务尚未完成时如何处理？本次不讨论跨地域。'
const probe = { originalQuestion, status: 'rewritten', question: rewrittenQuestion, model: 'actual-rewrite-model' }

async function chooseModel(actor: ReturnType<typeof userEvent.setup>) {
  await actor.click(screen.getByRole('combobox', { name: '问题改写模型' }))
  await actor.click(await screen.findByRole('option', { name: '快速模型' }))
}

describe('question rewrite configuration contracts', () => {
  it('reads legacy configuration disabled and preserves the new binding when another record is saved', () => {
    const { questionRewrite: _rewrite, ...legacy } = config
    expect(configSchema.parse(legacy).questionRewrite).toEqual(defaultQuestionRewrite)
    const updated = applyService(bound, { ...serviceForms(bound)[0], maxOutputTokens: 2048 })
    expect(updated.questionRewrite).toEqual(bound.questionRewrite)
    const draft = { ...bound, defaultModelId: '' }
    expect(recordPayload(bound, draft, { kind: 'defaultModelId' }).questionRewrite).toEqual(bound.questionRewrite)
    expect(mergeRecord(bound, updated, bound, { kind: 'models', id: 'model-1' }).questionRewrite).toEqual(bound.questionRewrite)
  })
  it('blocks deleting a selected model even while disabled and blocks disabling an active binding without removing siblings', () => {
    const shared = { ...bound, models: [...bound.models, { ...bound.models[0], id: 'sibling' }] }, selected = serviceForms(shared)[0]
    expect(() => applyService(shared, selected, true)).toThrow('问题改写引用')
    expect(() => applyService(shared, { ...selected, enabled: false })).toThrow('问题改写引用')
    const paused = { ...shared, questionRewrite: { ...shared.questionRewrite, enabled: false } }
    expect(() => applyService(paused, selected, true)).toThrow('清空模型选择')
    expect(applyService(paused, { ...selected, enabled: false }).questionRewrite.modelId).toBe('model-1')
    expect(applyService(shared, serviceForms(shared).find(item => item.id === 'sibling')!, true).models).toHaveLength(1)
    const unbound = { ...shared, questionRewrite: { ...defaultQuestionRewrite } }
    expect(applyService(unbound, selected, true).models[0].id).toBe('sibling')
  })
  it.each([499, 3001, 1500.5, Number.NaN])('rejects timeout %s before a write or test', timeoutMs => {
    expect(questionRewriteSchema.safeParse({ ...defaultQuestionRewrite, timeoutMs }).success).toBe(false)
    expect(validateQuestionRewrite(config, { ...defaultQuestionRewrite, timeoutMs })).toContain('500–3000')
  })
  it('requires an enabled existing LLM with saved credentials when enabling or testing', () => {
    expect(validateQuestionRewrite(config, { ...defaultQuestionRewrite, enabled: true })).toContain('已启用')
    expect(validateQuestionRewrite(config, { ...defaultQuestionRewrite, modelId: 'removed' })).toContain('不可用')
    const disabledModel = { ...bound, models: bound.models.map(model => ({ ...model, enabled: false })) }
    expect(validateQuestionRewrite(disabledModel, bound.questionRewrite)).toContain('已启用')
    expect(validateQuestionRewrite(disabledModel, { ...bound.questionRewrite, enabled: false })).toBe('')
    expect(validateQuestionRewrite(disabledModel, { ...bound.questionRewrite, enabled: false }, true)).toContain('已启用')
    expect(validateQuestionRewrite({ ...bound, providers: bound.providers.map(provider => ({ ...provider, hasApiKey: false })) }, bound.questionRewrite)).toContain('API Key')
  })
})

describe('question rewrite policy interaction', () => {
  it('keeps a selected model and timeout after closing, and saves through versioned config without exposing saved keys', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { writes.push(data(options)); return response({ ...data(options), version: 2 }) }))
    const view = render(QuestionRewritePolicy, { props: { api: new ApiClient('synthetic'), config: bound } }), actor = userEvent.setup()
    await actor.click(screen.getByRole('switch', { name: '启用问题改写' }))
    expect(screen.getByRole('combobox', { name: '问题改写模型' }).textContent).toContain('快速模型')
    await actor.click(screen.getByRole('button', { name: '保存问题改写配置' }))
    await waitFor(() => expect(view.emitted().saved).toHaveLength(1))
    expect(writes[0]).toMatchObject({ version: 1, questionRewrite: { enabled: false, modelId: 'model-1', timeoutMs: 1500 }, defaultModelId: 'model-1' })
    expect(JSON.stringify(writes[0])).not.toContain('hasApiKey')
    expect(screen.getByRole('status').textContent).toContain('模型选择与超时已保留')
  })
  it('tests the selected draft even when disabled without publishing or changing the global model parameters', async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (path: string, options: RequestInit) => { calls.push({ path, body: data(options) }); return response({ success: true, message: '固定样例测试完成', latencyMs: 80, questionRewrite: probe }) }))
    const view = render(QuestionRewritePolicy, { props: { api: new ApiClient('synthetic'), config } }), actor = userEvent.setup()
    await chooseModel(actor)
    await actor.click(screen.getByRole('button', { name: '测试问题改写' }))
    expect(await screen.findByText(rewrittenQuestion)).toBeTruthy()
    expect(screen.getByText(originalQuestion)).toBeTruthy()
    expect(screen.getByText(/实际模型：actual-rewrite-model/).textContent).toContain('80 ms')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ path: '/api/v1/admin/config/test', body: { capability: 'question-rewrite', config: { version: 1, questionRewrite: { enabled: false, modelId: 'model-1', timeoutMs: 1500 } } } })
    expect((calls[0].body.config as { models: unknown }).models).toEqual(config.models)
    expect(view.emitted().saved).toBeUndefined()
    expect(screen.getByRole('status').textContent).toContain('未保存配置')
  })
  it('retains the draft on supplier failure, clears stale previews after editing, and never claims a missing result passed', async () => {
    let attempt = 0
    const fetcher = vi.fn(async () => {
      attempt += 1
      return response(attempt === 1 ? { success: true, message: '测试完成', latencyMs: 80, questionRewrite: probe } : attempt === 2 ? { success: false, message: '改写服务超时', latencyMs: 1500 } : { success: true, message: '', latencyMs: 5 })
    })
    vi.stubGlobal('fetch', fetcher)
    render(QuestionRewritePolicy, { props: { api: new ApiClient('synthetic'), config: bound } }); const actor = userEvent.setup()
    await actor.click(screen.getByRole('button', { name: '测试问题改写' })); await screen.findByText(rewrittenQuestion)
    const timeout = screen.getByLabelText('问题改写超时（毫秒）'); await actor.clear(timeout); await actor.type(timeout, '2000')
    expect(screen.queryByText(rewrittenQuestion)).toBeNull()
    await actor.click(screen.getByRole('button', { name: '测试问题改写' })); await screen.findByText('改写服务超时')
    expect(timeout).toHaveProperty('value', '2000')
    await actor.click(screen.getByRole('button', { name: '测试问题改写' })); await screen.findByText('服务未返回有效的改写测试结果。')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('keeps the draft on version conflict and prevents writes until a reload updates the config', async () => {
    const writes: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { writes.push(data(options)); return response({ message: '版本冲突' }, 409) }))
    const view = render(QuestionRewritePolicy, { props: { api: new ApiClient('synthetic'), config } }), actor = userEvent.setup()
    await chooseModel(actor); await actor.click(screen.getByRole('switch', { name: '启用问题改写' })); await actor.click(screen.getByRole('button', { name: '保存问题改写配置' }))
    await screen.findByText(/配置已被其他管理员修改/)
    expect(screen.getByRole('combobox', { name: '问题改写模型' }).textContent).toContain('快速模型')
    expect(screen.getByRole('button', { name: '测试问题改写' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: '保存问题改写配置' })).toHaveProperty('disabled', true)
    expect(writes).toHaveLength(1)
    await view.rerender({ config: { ...config, version: 2 } })
    expect(screen.getByRole('button', { name: '保存问题改写配置' })).toHaveProperty('disabled', false)
  })
  it('aborts an inactive page test and ignores a late successful response', async () => {
    let signal: AbortSignal | null | undefined, complete: ((result: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => { signal = options.signal; return new Promise<Response>(resolve => { complete = resolve }) }))
    const view = render(QuestionRewritePolicy, { props: { api: new ApiClient('synthetic'), config: bound, active: true } }), actor = userEvent.setup()
    await actor.click(screen.getByRole('button', { name: '测试问题改写' }))
    expect(signal?.aborted).toBe(false)
    await view.rerender({ active: false })
    expect(signal?.aborted).toBe(true)
    complete?.(response({ success: true, message: '迟到结果', latencyMs: 80, questionRewrite: probe }))
    await view.rerender({ active: true })
    expect(screen.queryByText(rewrittenQuestion)).toBeNull()
    expect(view.emitted().saved).toBeUndefined()
  })
  it('keeps an existing rewrite binding when saving the screenshot policy', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { writes.push(data(options)); return response({ ...data(options), version: 2 }) }))
    render(ScreenshotModelPolicy, { props: { api: new ApiClient('synthetic'), config: bound } }); const actor = userEvent.setup()
    await actor.click(screen.getByRole('combobox', { name: '截图识别模型' })); await actor.click(await screen.findByRole('option', { name: '快速模型' }))
    await actor.click(screen.getByRole('button', { name: '保存截图识别配置' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].questionRewrite).toEqual(bound.questionRewrite)
  })
})

describe('question rewrite operations', () => {
  it('accepts the new stage, retains actual model and safe token metadata, and does not label it as the answer model', () => {
    const rewrite = eventSchema.parse({ ...event, stage: 'question.rewrite', providerType: 'llm', model: 'actual-rewrite-model', outcome: 'degraded', reason: 'invalid_output', metadata: { inputTokens: 150, outputTokens: 50, totalTokens: 200, platformVersion: 4, question: originalQuestion } })
    expect(rewrite.metadata).not.toHaveProperty('question')
    expect(rewrite.metadata).toMatchObject({ inputTokens: 150, platformVersion: 4 })
    render(OperationTimeline, { props: { data: { ...trace, events: [rewrite] } } })
    expect(screen.getByText('问题改写')).toBeTruthy()
    expect(screen.getByText('服务：问题改写模型 · actual-rewrite-model')).toBeTruthy()
    expect(screen.getByText('分类：响应内容无效')).toBeTruthy()
  })
})
