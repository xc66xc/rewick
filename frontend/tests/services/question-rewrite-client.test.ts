import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../src/shared/defaults'
import { questionRewriteContext, questionRewriteResultSchema } from '../../src/shared/question-rewrite'
import type { AnswerRequest, Settings, TranscriptSegment } from '../../src/shared/types'
import { PlatformRequestError } from '../../src/main/services/platform-client'
import { QuestionRewriteClient } from '../../src/main/services/question-rewrite-client'
import { SessionFault } from '../../src/main/services/session-fault'
import { sessionRecordSchema } from '../../src/main/services/validation'

const request: AnswerRequest = { requestId: 'original-answer', question: '就是那个 Redis 锁，过期了任务还没做完咋办？', transcript: '未定稿，不应作为上下文自动发送', rewriteContext: ['正在讨论员工助手的多实例任务执行。'] }
const result = { status: 'rewritten' as const, question: '员工助手多实例部署时，Redis 锁过期但任务尚未完成应如何处理？', reason: null, model: 'rewrite-model', durationMs: 120, platformVersion: 7 }
function settings(enabled = true): Settings {
  return { ...structuredClone(defaultSettings), platform: { ...defaultSettings.platform, enabled: true, baseUrl: 'https://platform.example.test', authenticated: true, capabilities: { llm: true, asr: true }, models: { llm: 'answer-model', asr: 'asr-model' }, platformVersion: 6, questionRewrite: { enabled, timeoutMs: 1500 } } }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('question rewrite preparation', () => {
  it.each(['platform', 'custom'] as const)('uses one platform-owned rewrite with %s answering and keeps the original request immutable', async source => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => Response.json(result))
    vi.stubGlobal('fetch', fetcher)
    const config = settings()
    config.serviceSelections = { llm: { source, id: 'answer-model' } }
    const original = structuredClone(request)
    expect(await new QuestionRewriteClient(config, 'platform-token').rewrite(request, new AbortController().signal)).toEqual(result)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://platform.example.test/api/v1/questions/rewrite')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer platform-token', 'X-Request-Id': expect.stringMatching(/^[0-9a-f-]{36}$/) })
    expect((init.headers as Record<string, string>)['X-Request-Id']).not.toBe(request.requestId)
    expect(JSON.parse(String(init.body))).toEqual({ question: request.question, context: request.rewriteContext })
    expect(request).toEqual(original)
  })

  it.each(['disabled', 'missing', 'algorithm'] as const)('bypasses %s without a request or timer', async mode => {
    vi.useFakeTimers()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const config = settings(mode !== 'disabled')
    if (mode === 'missing' && config.platform) delete config.platform.questionRewrite
    expect(await new QuestionRewriteClient(config, '').rewrite({ ...request, ...(mode === 'algorithm' ? { mode: 'algorithm' } : {}) }, new AbortController().signal)).toBeUndefined()
    expect(fetcher).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skips the complete oversized original instead of truncating it into a different question', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const input = { ...request, question: '题'.repeat(3001) }
    expect(await new QuestionRewriteClient(settings(), 'token').rewrite(input, new AbortController().signal)).toMatchObject({ status: 'skipped', reason: 'input_limit', question: null })
    expect(input.question).toHaveLength(3001)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each(['unchanged', 'skipped', 'degraded'] as const)('accepts %s while keeping the effective question absent', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...result, status, question: null, reason: 'ambiguous' })))
    expect(await new QuestionRewriteClient(settings(), 'token').rewrite(request, new AbortController().signal)).toMatchObject({ status, question: null })
  })

  it.each([{ ...result, question: '' }, { ...result, status: 'unchanged' }, { ...result, question: '题'.repeat(3001) }, { ...result, durationMs: -1 }, { ...result, reason: 'unrecognized-provider-detail' }])('falls back when the response violates the rewrite contract', async response => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(response)))
    expect(await new QuestionRewriteClient(settings(), 'token').rewrite(request, new AbortController().signal)).toMatchObject({ status: 'degraded', reason: 'invalid_output', question: null })
  })

  it('bounds the wait, aborts transport and ignores a late provider result without retrying', async () => {
    vi.useFakeTimers()
    let release: (response: Response) => void = () => undefined
    const fetcher = vi.fn((_url: string, init: RequestInit) => init.method === 'DELETE' ? Promise.resolve(new Response(null, { status: 204 })) : new Promise<Response>(resolve => { release = resolve }))
    vi.stubGlobal('fetch', fetcher)
    const pending = new QuestionRewriteClient(settings(), 'token').rewrite(request, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toMatchObject({ status: 'degraded', reason: 'timeout', question: null })
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
    release(Response.json(result))
    await Promise.resolve()
    expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
    expect(fetcher.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('treats cancellation as terminal even if the transport later supplies a successful rewrite', async () => {
    let release: (response: Response) => void = () => undefined
    const fetcher = vi.fn((_url: string, init: RequestInit) => init.method === 'DELETE' ? Promise.resolve(new Response(null, { status: 204 })) : new Promise<Response>(resolve => { release = resolve }))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    const config = settings()
    const pending = new QuestionRewriteClient(config, 'token').rewrite(request, controller.signal)
    const rejected = expect(pending).rejects.toThrow('账户已切换')
    if (config.platform) config.platform.baseUrl = 'https://new-account.example.test'
    controller.abort(new Error('账户已切换'))
    await rejected
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
    release(Response.json(result))
    await Promise.resolve()
    expect(fetcher.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
    const cancelled = fetcher.mock.calls.find(call => call[1].method === 'DELETE')
    expect(cancelled?.[0]).toMatch(/^https:\/\/platform.example.test\/api\/v1\/questions\/rewrite\//)
    expect(cancelled?.[1].headers).toEqual({ Authorization: 'Bearer token' })
  })

  it.each([402, 403, 409])('does not downgrade terminal HTTP %s into a new answer', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status })))
    await expect(new QuestionRewriteClient(settings(), 'token').rewrite(request, new AbortController().signal)).rejects.toBeInstanceOf(PlatformRequestError)
  })

  it('preserves platform authentication faults rather than querying with stale credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'session_expired' }, { status: 401 })))
    await expect(new QuestionRewriteClient(settings(), 'token').rewrite(request, new AbortController().signal)).rejects.toBeInstanceOf(SessionFault)
  })

  it('stores bounded rewrite metadata alongside the original question and reads old history', () => {
    const answer = { id: 'answer', question: request.question, text: '回答', status: 'complete', createdAt: '2026-11-12T10:00:00Z', questionRewrite: result }
    const record = { id: 'record', title: '会话', createdAt: answer.createdAt, segments: [], answers: [answer] }
    expect(sessionRecordSchema.parse(record).answers[0]).toMatchObject({ question: request.question, questionRewrite: result })
    expect(sessionRecordSchema.parse({ ...record, answers: [{ ...answer, questionRewrite: undefined }] }).answers[0].questionRewrite).toBeUndefined()
    expect(questionRewriteResultSchema.safeParse({ ...result, status: 'skipped' }).success).toBe(false)
    expect(sessionRecordSchema.safeParse({ ...record, answers: [{ ...answer, questionRewrite: { ...result, reason: 'unknown_reason' } }] }).success).toBe(false)
  })
})

describe('question rewrite context snapshot', () => {
  const segment = (id: string, text: string, isFinal = true): TranscriptSegment => ({ id, text, isFinal, startMs: 0 })
  it('uses at most six recent final segments before the submitted question and excludes partial or later subtitles', () => {
    const segments = Array.from({ length: 8 }, (_, index) => segment(String(index), `定稿${index}`))
    segments.splice(4, 0, segment('partial', '实时字幕', false))
    segments.push(segment('current', request.question), segment('later', '之后收到的字幕'))
    expect(questionRewriteContext(segments, request.question, ['current'])).toEqual(['定稿2', '定稿3', '定稿4', '定稿5', '定稿6', '定稿7'])
    expect(questionRewriteContext([], request.question)).toEqual([])
  })
  it('keeps the 1500-character budget without splitting a Unicode character', () => {
    const context = questionRewriteContext([segment('old', '旧上下文'), segment('recent', '😀'.repeat(1501))], request.question)
    expect(context).toEqual(['😀'.repeat(1500)])
  })
  it('excludes a manually assembled current question and provisional subtitles from context', () => {
    const segments = [segment('before', '我们先聊多实例任务。'), segment('part-a', '锁到期怎么办？'), segment('part-b', '任务还没完成怎么办？'), segment('partial', '临时识别', false)]
    expect(questionRewriteContext(segments, '锁到期怎么办？任务还没完成怎么办？')).toEqual(['我们先聊多实例任务。'])
  })
})
