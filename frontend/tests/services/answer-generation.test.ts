import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnswerRequest, AppEvent, Settings } from '../../src/shared/types'
import { defaultSettings } from '../../src/shared/defaults'
import { questionRewriteResultSchema, type ExtractedQuestion } from '../../src/shared/question-rewrite'
import { generateAnswer, cancelAnswerGeneration, finishAnswerGeneration, type AnswerGenerationDependencies, type AnswerWork } from '../../src/main/services/answer-generation'
import { ReferenceService } from '../../src/main/services/reference-service'
import { OperationsTelemetry } from '../../src/main/services/operations-telemetry'
import { PlatformWork } from '../../src/main/services/platform-work'
import { routeService } from '../../src/main/services/service-routing'
import { sessionRecordSchema } from '../../src/main/services/validation'

interface Call { url: string; init: RequestInit }
type ResponseOverride = (call: Call) => Response | Promise<Response> | undefined
const original = '就是 Redis 那个锁过期了，任务还没有做完，怎么处理呢？'
const rewritten = 'Redis 锁过期但任务尚未完成时应如何处理？'
const rewriteResult = { status: 'rewritten' as const, question: rewritten, reason: null, model: 'rewrite-model', durationMs: 25, platformVersion: 8 }
const excerpt = { source: 'platform' as const, documentId: 'document-one', chunkId: 'chunk-one', revision: 1, name: '知识库', kind: 'technical' as const, text: '引用材料' }
const pendingWork = new Set<AnswerWork>()
const telemetryServices = new Set<OperationsTelemetry>()

function fixture(options: { enabled?: boolean; source?: 'platform' | 'custom'; web?: boolean; questions?: ExtractedQuestion[]; respond?: ResponseOverride } = {}) {
  const source = options.source ?? 'custom'
  const settings: Settings = {
    ...structuredClone(defaultSettings),
    llm: { ...defaultSettings.llm, baseUrl: 'https://custom.example.test/v1', model: 'custom-answer', hasApiKey: true },
    customServices: [{ id: 'custom', name: '自己的回答模型', kind: 'llm', url: 'https://custom.example.test/v1', model: 'custom-answer', hasApiKey: true }],
    serviceSelections: { llm: { source, id: source === 'custom' ? 'custom' : 'platform-answer' } },
    platform: { enabled: true, baseUrl: 'https://platform.example.test', authenticated: true, expiresAt: new Date(Date.now() + 3600000).toISOString(), advancedSettingsEnabled: true,
      models: { llm: 'platform-answer', asr: 'asr', available: [{ id: 'platform-answer', name: '平台回答模型' }] }, capabilities: { llm: true, asr: true },
      questionRewrite: { enabled: options.enabled ?? true, timeoutMs: 1500, ...(options.questions ? { resultFormats: ['single', 'questions-v1'], batchReferencesAvailable: true } : {}) }, platformVersion: 7, webSearchAvailable: true },
    retrieval: { enabled: true }, webSearch: { enabled: options.web ?? true },
    interviewEnvironment: { id: 'env', name: '环境', resumeId: null, resumeName: '', targetId: null, targetName: '', referenceIds: ['document-one'] },
  }
  const secrets = { platformAccessToken: 'original-platform-token', llmApiKey: 'custom-key', asrApiKey: '' }
  const events: AppEvent[] = []
  const calls: Call[] = []
  const work: AnswerWork = { epoch: 0, pendingId: null, activeId: null, controller: null, llm: null }
  pendingWork.add(work)
  const platformWork = new PlatformWork()
  const telemetry = new OperationsTelemetry(async () => undefined, 'test')
  telemetryServices.add(telemetry)
  const emit = (event: AppEvent) => { finishAnswerGeneration(work, event); events.push(event) }
  let active = true
  const dependencies: AnswerGenerationDependencies = {
    assertActive: () => { if (!active) throw new Error('面试已结束') },
    isChangingEnvironment: () => false, background: () => undefined, sessionId: () => 'session-one',
    getSnapshot: async () => ({ settings, secrets }), resolve: async value => value,
    connect: async value => routeService(value.settings, value.secrets, 'llm'),
    references: new ReferenceService(() => undefined, async () => ({ settings, secrets })),
    telemetry, platformWork, emit,
  }
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url, init }
    calls.push(call)
    const response = options.respond?.(call)
    if (response !== undefined) return response
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    if (url.endsWith('/questions/rewrite')) return Response.json(options.questions ? { ...rewriteResult, question: undefined, resultFormat: 'questions-v1', questions: options.questions } : rewriteResult)
    if (url.endsWith('/references/search/batch')) return Response.json({ status: 'ready', excerpts: options.questions?.map(question => ({ ...excerpt, excerptId: `ref-${question.id}`, questionIds: [question.id], text: `${question.id}的资料正文` })) ?? [],
      queries: options.questions?.map(question => ({ questionId: question.id, status: 'ready', excerptIds: [`ref-${question.id}`] })) ?? [], policyVersion: 9, platformVersion: 8 })
    if (url.endsWith('/references/search')) return Response.json({ status: 'ready', excerpts: [excerpt] })
    if (url.endsWith('/web-search')) return Response.json({ status: 'ready', excerpts: [{ ...excerpt, source: 'web', documentId: 'web-one', chunkId: 'web-chunk', name: '网页', url: 'https://source.example.test/page' }] })
    if (url.endsWith('/chat/completions')) return Response.json({ choices: [{ message: { content: '最终口语回答。' } }] })
    throw new Error(`Unexpected test endpoint: ${url}`)
  })
  vi.stubGlobal('fetch', fetcher)
  const start = (id = 'answer-one', input: Partial<AnswerRequest> = {}) => generateAnswer({ requestId: id, question: original, transcript: '原始转写', rewriteContext: ['讨论 Redis 多实例任务。'], ...input }, work, dependencies)
  const matching = (suffix: string) => calls.filter(call => call.url.endsWith(suffix))
  const finalPayload = () => JSON.parse(String(matching('/chat/completions')[0]?.init.body)) as { messages: { content: string }[] }
  const waitComplete = (id = 'answer-one') => vi.waitFor(() => expect(events.some(event => event.kind === 'answer-done' && event.requestId === id && !event.cancelled)).toBe(true))
  return { settings, work, events, calls, start, matching, finalPayload, waitComplete, platformWork,
    cancel: () => cancelAnswerGeneration(work, emit), end: () => { active = false; cancelAnswerGeneration(work, emit) } }
}

afterEach(() => {
  for (const work of pendingWork) cancelAnswerGeneration(work, () => undefined)
  for (const telemetry of telemetryServices) telemetry.dispose()
  pendingWork.clear(); telemetryServices.clear()
  vi.unstubAllGlobals(); vi.useRealTimers()
})

function extractedQuestions(count: number): ExtractedQuestion[] {
  const names = ['除了 ReAct，还有哪些常见 Agent 模式？', '什么是 SSE？', 'MCP 除 SSE 外支持哪些传输方式？', '任务重复执行如何避免？', 'Redis 锁过期怎么办？']
  return names.slice(0, count).map((question, index) => ({ id: `q${index + 1}` as ExtractedQuestion['id'], question, sourceTexts: [question] }))
}
function webResponse(query: string, text = `查询 ${query} 的网页片段`, summary = false): Response {
  return Response.json({ status: 'ready', excerpts: [{ ...excerpt, source: 'web', name: summary ? 'Tavily 自动摘要' : '实际网页', documentId: 'web-one', chunkId: 'web-one', text,
    ...(summary ? { generatedSummary: true } : { url: 'https://source.example.test/page#section' }) }] })
}

describe('production multi-question answer orchestration', () => {
  it.each(['invalid_source', 'unchanged'] as const)('uses the existing raw single-query flow without retry when extraction is %s', async failure => {
    const questions = extractedQuestions(3)
    const f = fixture({ questions, respond: call => call.url.endsWith('/questions/rewrite') ? Response.json({ ...rewriteResult, question: undefined, resultFormat: 'questions-v1',
      ...(failure === 'unchanged' ? { status: 'unchanged', questions: [], reason: 'ambiguous' } : { questions: questions.map(question => ({ ...question, sourceTexts: ['fabricated source'] })) }) }) : undefined })
    await f.start(); await f.waitComplete()
    expect(f.matching('/questions/rewrite')).toHaveLength(1)
    expect(f.matching('/references/search/batch')).toHaveLength(0)
    expect(JSON.parse(String(f.matching('/references/search')[0].init.body)).query).toBe(original)
    expect(JSON.parse(String(f.matching('/web-search')[0].init.body)).query).toBe(original)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(JSON.parse(f.finalPayload().messages[1].content)).not.toHaveProperty('questions')
  })
  it.each([1, 3, 5])('negotiates one extraction and one reference batch for N=%s while making one complete final answer', async count => {
    const questions = extractedQuestions(count)
    const raw = `开场背景 Reactor 与流式链路。${questions.map(question => question.question).join(' ')}`
    const f = fixture({ questions, respond: call => call.url.endsWith('/web-search') ? webResponse(JSON.parse(String(call.init.body)).query) : undefined })
    await f.start('multi', { question: raw })
    await f.waitComplete('multi')
    expect(f.matching('/questions/rewrite')).toHaveLength(1)
    expect(JSON.parse(String(f.matching('/questions/rewrite')[0].init.body)).resultFormat).toBe('questions-v1')
    expect(f.matching('/references/search')).toHaveLength(0)
    expect(f.matching('/references/search/batch')).toHaveLength(1)
    expect(JSON.parse(String(f.matching('/references/search/batch')[0].init.body)).queries).toEqual(questions.map(question => ({ questionId: question.id, query: question.question })))
    expect(f.matching('/web-search')).toHaveLength(count)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    const input = JSON.parse(f.finalPayload().messages[1].content)
    expect(input.question).toBe(raw)
    expect(input.questions).toEqual(questions)
    expect(input).not.toHaveProperty('rewrittenQuestion')
    expect(input.questionRetrieval).toHaveLength(count)
    expect(input.questionRetrieval.every((query: { excerptIds: string[] }) => query.excerptIds.length >= 2)).toBe(true)
    expect(input.referenceContext.filter((row: { source: string }) => row.source === 'web')).toHaveLength(count)
    expect(f.events.find(event => event.kind === 'answer-context')).not.toHaveProperty('retrieval.hybrid')
  })

  it('limits web concurrency to two, keeps same-URL distinct content and merges only true duplicate evidence', async () => {
    const questions = extractedQuestions(5)
    const releases: (() => void)[] = []
    let active = 0, maximum = 0
    const f = fixture({ questions, respond: call => {
      if (!call.url.endsWith('/web-search')) return
      const query = JSON.parse(String(call.init.body)).query as string
      active++; maximum = Math.max(maximum, active)
      return new Promise<Response>(resolve => { releases.push(() => { active--; resolve(webResponse(query, query === questions[1].question ? '完全重复的网页事实' : query === questions[3].question ? '完全重复的网页事实' : `不同的事实：${query}`)) }) })
    } })
    const pending = f.start('multi', { question: questions.map(question => question.question).join(' ') })
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    expect(f.matching('/chat/completions')).toHaveLength(0)
    for (let index = 0; index < 5; index++) {
      await vi.waitFor(() => expect(releases[index]).toBeDefined())
      releases[index]()
    }
    await pending; await f.waitComplete('multi')
    expect(maximum).toBe(2)
    const input = JSON.parse(f.finalPayload().messages[1].content)
    const web = input.referenceContext.filter((row: { source: string }) => row.source === 'web')
    expect(web).toHaveLength(4)
    expect(web.find((row: { text: string }) => row.text === '完全重复的网页事实').questionIds).toEqual(['q2', 'q4'])
  })

  it('keeps multiple URL-less generated summaries separate and preserves per-question evidence', async () => {
    const questions = extractedQuestions(3)
    const f = fixture({ questions, respond: call => call.url.endsWith('/web-search') ? webResponse(JSON.parse(String(call.init.body)).query, '相同摘要正文', true) : undefined })
    await f.start('multi', { question: questions.map(question => question.question).join(' ') }); await f.waitComplete('multi')
    const context = f.events.find(event => event.kind === 'answer-context')
    if (context?.kind !== 'answer-context') throw new Error('Missing context')
    const summaries = context.retrieval.excerpts.filter(row => row.generatedSummary)
    expect(summaries).toHaveLength(3)
    expect(new Set(summaries.map(row => row.excerptId)).size).toBe(3)
    expect(summaries.every(row => !row.url && row.source === 'web')).toBe(true)
    const snapshot = { id: 'history', title: '记录', createdAt: '2026-11-13T10:00:00Z', segments: [], answers: [{ id: 'multi', question: questions.map(question => question.question).join(' '), text: '回答', createdAt: '2026-11-13T10:00:00Z', status: 'complete', retrieval: context.retrieval, questionRewrite: context.questionRewrite }] }
    expect(sessionRecordSchema.safeParse(snapshot).success).toBe(true)
    expect(sessionRecordSchema.safeParse({ ...snapshot, answers: [{ ...snapshot.answers[0], question: 'different current question' }] }).success).toBe(false)
  })

  it('isolates one failed web query while preserving the other questions and making only one answer', async () => {
    const questions = extractedQuestions(3)
    const f = fixture({ questions, respond: call => call.url.endsWith('/web-search') && JSON.parse(String(call.init.body)).query === questions[1].question ? Response.json({}, { status: 502 }) : undefined })
    await f.start('multi', { question: questions.map(question => question.question).join(' ') }); await f.waitComplete('multi')
    expect(f.matching('/web-search')).toHaveLength(3)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    const input = JSON.parse(f.finalPayload().messages[1].content)
    expect(input.questionRetrieval[1]).toMatchObject({ questionId: 'q2', status: 'degraded', web: { status: 'degraded' } })
    expect(input.questionRetrieval[0].status).toBe('ready')
    expect(input.questionRetrieval[2].status).toBe('ready')
  })

  it('shares one retrieval deadline including queued web work and ignores all late evidence', async () => {
    vi.useFakeTimers()
    const questions = extractedQuestions(5)
    const releases: ((value: Response) => void)[] = []
    const f = fixture({ questions, respond: call => call.url.endsWith('/web-search') || call.url.endsWith('/references/search/batch') ? new Promise<Response>(resolve => { releases.push(resolve) }) : undefined })
    const pending = f.start('multi', { question: questions.map(question => question.question).join(' ') })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.matching('/web-search')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(30_000)
    await pending; await f.waitComplete('multi')
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(f.matching('/web-search')).toHaveLength(2)
    expect(JSON.parse(f.finalPayload().messages[1].content).referenceContext).toEqual([])
    for (const release of releases) release(Response.json({ status: 'empty', excerpts: [] }))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.matching('/web-search')).toHaveLength(2)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(f.calls.filter(call => call.init.method === 'DELETE' && call.url.includes('/references/search/batch/'))).toHaveLength(1)
  })

  it.each(['cancel', 'platform_change'] as const)('cancels queued and in-flight multi-question work on %s without a final answer', async action => {
    const questions = extractedQuestions(5)
    const f = fixture({ questions, respond: call => call.url.endsWith('/web-search') || call.url.endsWith('/references/search/batch') ? new Promise<Response>(() => undefined) : undefined })
    const pending = f.start('multi', { question: questions.map(question => question.question).join(' ') })
    await vi.waitFor(() => expect(f.matching('/web-search')).toHaveLength(2))
    if (action === 'cancel') f.cancel(); else f.platformWork.beginChange()()
    await pending
    expect(f.matching('/web-search')).toHaveLength(2)
    expect(f.matching('/chat/completions')).toHaveLength(0)
    expect(f.events.some(event => event.kind === 'answer-done' && event.cancelled)).toBe(true)
  })

  it.each([401, 402, 403, 409])('treats web HTTP %s as terminal for the whole multi-question answer', async status => {
    const questions = extractedQuestions(3)
    const f = fixture({ questions, respond: call => call.url.endsWith('/web-search') ? Response.json({ code: 'session_expired' }, { status }) : undefined })
    await expect(f.start('multi', { question: questions.map(question => question.question).join(' ') })).rejects.toBeInstanceOf(Error)
    expect(f.matching('/chat/completions')).toHaveLength(0)
  })

  it('keeps queued web work and the final model on the frozen account origin and configuration', async () => {
    const questions = extractedQuestions(3)
    const releases: (() => void)[] = []
    const f = fixture({ questions, respond: call => call.url.endsWith('/web-search') && releases.length < 2 ? new Promise<Response>(resolve => { releases.push(() => resolve(webResponse('frozen-query'))) }) : undefined })
    const pending = f.start('multi', { question: questions.map(question => question.question).join(' ') })
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    // Simulate mutation of a shared catalog object without a platform invalidation event.
    if (f.settings.platform) f.settings.platform.baseUrl = 'https://different-account.example.test'
    f.settings.context.text = 'later unrelated background'
    for (const release of releases) release()
    await pending; await f.waitComplete('multi')
    expect(f.matching('/web-search')).toHaveLength(3)
    expect(f.matching('/web-search').every(call => call.url.startsWith('https://platform.example.test/') && new Headers(call.init.headers).get('Authorization') === 'Bearer original-platform-token')).toBe(true)
    expect(JSON.parse(f.finalPayload().messages[1].content).personalContext).not.toBe('later unrelated background')
  })
})

describe('production answer:generate orchestration', () => {
  it.each(['custom', 'platform'] as const)('bypasses disabled rewriting with %s answering and preserves the existing query and final messages', async source => {
    const f = fixture({ enabled: false, source })
    await f.start()
    await f.waitComplete()
    expect(f.matching('/questions/rewrite')).toHaveLength(0)
    expect(f.matching('/references/search')).toHaveLength(1)
    expect(f.matching('/web-search')).toHaveLength(1)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(JSON.parse(String(f.matching('/references/search')[0].init.body)).query).toBe(original)
    expect(JSON.parse(String(f.matching('/web-search')[0].init.body)).query).toBe(original)
    expect(JSON.parse(f.finalPayload().messages[1].content)).toMatchObject({ question: original })
    expect(JSON.parse(f.finalPayload().messages[1].content)).not.toHaveProperty('rewrittenQuestion')
    expect(f.events.some(event => event.kind === 'answer-preparing')).toBe(false)
  })

  it.each(['custom', 'platform'] as const)('rewrites once, starts reference/web retrieval in parallel with one query and makes one final %s answer', async source => {
    let release: (value: Response) => void = () => undefined
    const f = fixture({ source, respond: call => call.url.endsWith('/references/search') ? new Promise<Response>(resolve => { release = resolve }) : undefined })
    const pending = f.start()
    await vi.waitFor(() => expect(f.matching('/web-search')).toHaveLength(1))
    expect(f.matching('/references/search')).toHaveLength(1)
    expect(f.matching('/chat/completions')).toHaveLength(0)
    release(Response.json({ status: 'ready', excerpts: [excerpt] }))
    await pending
    await f.waitComplete()
    expect(f.matching('/questions/rewrite')).toHaveLength(1)
    expect(JSON.parse(String(f.matching('/references/search')[0].init.body)).query).toBe(rewritten)
    expect(JSON.parse(String(f.matching('/web-search')[0].init.body)).query).toBe(rewritten)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(JSON.parse(f.finalPayload().messages[1].content)).toMatchObject({ question: original, rewrittenQuestion: rewritten })
    const context = f.events.find(event => event.kind === 'answer-context')
    expect(context).toMatchObject({ requestId: 'answer-one', questionRewrite: rewriteResult })
    expect(f.events.find(event => event.kind === 'answer-request')).toMatchObject({ modelInput: { messages: f.finalPayload().messages } })
  })

  it.each(['invalid_reason', 'invalid_question', 'ambiguous'] as const)('falls back to the complete original question on %s and produces a synchronizable history snapshot', async outcome => {
    const response = outcome === 'invalid_reason' ? { ...rewriteResult, reason: 'unexpected-provider-internal-detail' }
      : outcome === 'invalid_question' ? { ...rewriteResult, question: '' }
        : { ...rewriteResult, status: 'unchanged', question: null, reason: 'ambiguous' }
    const f = fixture({ respond: call => call.url.endsWith('/questions/rewrite') ? Response.json(response) : undefined })
    await f.start()
    await f.waitComplete()
    expect(JSON.parse(String(f.matching('/references/search')[0].init.body)).query).toBe(original)
    expect(JSON.parse(String(f.matching('/web-search')[0].init.body)).query).toBe(original)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(JSON.parse(f.finalPayload().messages[1].content)).not.toHaveProperty('rewrittenQuestion')
    const context = f.events.find(event => event.kind === 'answer-context')
    const metadata = context?.kind === 'answer-context' ? context.questionRewrite : undefined
    expect(metadata).toMatchObject({ question: null, reason: outcome === 'ambiguous' ? 'ambiguous' : 'invalid_output' })
    expect(questionRewriteResultSchema.safeParse(metadata).success).toBe(true)
    const createdAt = '2026-11-12T10:00:00Z'
    expect(sessionRecordSchema.safeParse({ id: 'history', title: '记录', createdAt, segments: [], answers: [{ id: 'answer-one', question: original, text: '回答', createdAt, status: 'complete', questionRewrite: metadata }] }).success).toBe(true)
  })

  it('falls back once after the bounded timeout and never uses a late rewrite for retrieval or a second answer', async () => {
    vi.useFakeTimers()
    let release: (value: Response) => void = () => undefined
    const f = fixture({ respond: call => call.url.endsWith('/questions/rewrite') ? new Promise<Response>(resolve => { release = resolve }) : undefined })
    const pending = f.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.matching('/questions/rewrite')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    await pending
    await f.waitComplete()
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(JSON.parse(String(f.matching('/references/search')[0].init.body)).query).toBe(original)
    expect(JSON.parse(String(f.matching('/web-search')[0].init.body)).query).toBe(original)
    expect(f.events.find(event => event.kind === 'answer-context')).toMatchObject({ questionRewrite: { status: 'degraded', reason: 'timeout', question: null } })
    release(Response.json(rewriteResult))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.matching('/references/search')).toHaveLength(1)
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(f.calls.filter(call => call.init.method === 'DELETE')).toHaveLength(1)
  })

  it.each(['cancel', 'end', 'platform_change'] as const)('stops custom answering before retrieval on %s and discards a late successful rewrite', async action => {
    let release: (value: Response) => void = () => undefined
    const f = fixture({ web: false, respond: call => call.url.endsWith('/questions/rewrite') ? new Promise<Response>(resolve => { release = resolve }) : undefined })
    const pending = f.start()
    await vi.waitFor(() => expect(f.matching('/questions/rewrite')).toHaveLength(1))
    if (action === 'cancel') f.cancel()
    else if (action === 'end') f.end()
    else f.platformWork.beginChange()()
    await pending
    release(Response.json(rewriteResult))
    await Promise.resolve()
    expect(f.matching('/references/search')).toHaveLength(0)
    expect(f.matching('/web-search')).toHaveLength(0)
    expect(f.matching('/chat/completions')).toHaveLength(0)
    expect(f.events.filter(event => event.kind === 'answer-done')).toEqual([{ kind: 'answer-done', requestId: 'answer-one', cancelled: true }])
    expect(f.events.some(event => event.kind === 'answer-context' || event.kind === 'answer-request')).toBe(false)
    expect(f.calls.filter(call => call.init.method === 'DELETE')).toHaveLength(1)
  })

  it('supersedes the old preparation and never attaches its late query or metadata to the next request', async () => {
    let release: (value: Response) => void = () => undefined
    let rewrites = 0
    const nextQuestion = '另外一个问题：怎么避免重复执行？'
    const f = fixture({ respond: call => {
      if (!call.url.endsWith('/questions/rewrite')) return
      rewrites++
      return rewrites === 1 ? new Promise<Response>(resolve => { release = resolve }) : Response.json({ ...rewriteResult, question: nextQuestion })
    } })
    const old = f.start('old-answer')
    await vi.waitFor(() => expect(f.matching('/questions/rewrite')).toHaveLength(1))
    await f.start('new-answer', { question: nextQuestion })
    await old
    await f.waitComplete('new-answer')
    release(Response.json(rewriteResult))
    await Promise.resolve()
    expect(f.matching('/chat/completions')).toHaveLength(1)
    expect(f.events.filter(event => event.kind === 'answer-context')).toMatchObject([{ requestId: 'new-answer', questionRewrite: { question: nextQuestion } }])
    expect(f.events.find(event => event.kind === 'answer-request')).toMatchObject({ requestId: 'new-answer' })
    expect(JSON.parse(String(f.matching('/references/search')[0].init.body)).query).toBe(nextQuestion)
  })

  it('does not start the final model when retrieval arrives after the owner cancels', async () => {
    let release: (value: Response) => void = () => undefined
    const f = fixture({ respond: call => call.url.endsWith('/references/search') ? new Promise<Response>(resolve => { release = resolve }) : undefined })
    const pending = f.start()
    await vi.waitFor(() => expect(f.matching('/web-search')).toHaveLength(1))
    f.cancel()
    release(Response.json({ status: 'ready', excerpts: [excerpt] }))
    await pending
    expect(f.matching('/chat/completions')).toHaveLength(0)
    expect(f.events.some(event => event.kind === 'answer-context' || event.kind === 'answer-request')).toBe(false)
    expect(f.events.filter(event => event.kind === 'answer-done')).toEqual([{ kind: 'answer-done', requestId: 'answer-one', cancelled: true }])
  })

  it.each([401, 402, 403, 409])('stops the complete pipeline on platform authentication/session HTTP %s', async status => {
    const f = fixture({ respond: call => call.url.endsWith('/questions/rewrite') ? Response.json({ code: 'session_expired' }, { status }) : undefined })
    await expect(f.start()).rejects.toBeInstanceOf(Error)
    expect(f.matching('/references/search')).toHaveLength(0)
    expect(f.matching('/web-search')).toHaveLength(0)
    expect(f.matching('/chat/completions')).toHaveLength(0)
    expect(f.work.pendingId).toBeNull()
    expect(f.work.controller).toBeNull()
  })

  it('leaves the separate algorithm path out of rewriting and retrieval', async () => {
    const f = fixture()
    await f.start('algorithm', { mode: 'algorithm', language: 'Python', question: '返回两数之和的下标。' })
    await f.waitComplete('algorithm')
    expect(f.matching('/questions/rewrite')).toHaveLength(0)
    expect(f.matching('/references/search')).toHaveLength(0)
    expect(f.matching('/web-search')).toHaveLength(0)
    expect(f.matching('/chat/completions')).toHaveLength(1)
  })
})
