import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationsTelemetry, operationHeaders } from '../../src/main/services/operations-telemetry'
import { telemetryEventSchema } from '../../src/shared/telemetry'
import { LlmClient } from '../../src/main/services/llm-client'
import { onSessionFault } from '../../src/main/services/session-fault'
import { defaultSettings } from '../../src/shared/defaults'

const identity = { accountId: 'account-one', baseUrl: 'http://127.0.0.1:1234', token: 'test-token' }
let telemetry: OperationsTelemetry | undefined
const batches: { events: unknown[]; droppedCount: number }[] = []
afterEach(() => { telemetry?.dispose(); telemetry = undefined; batches.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
async function enable(connection = async () => identity) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/settings')) return Response.json({ enabled: true })
    batches.push(JSON.parse(String(options?.body)))
    return Response.json({ accepted: 64, dropped: 0 }, { status: 202 })
  }))
  telemetry = new OperationsTelemetry(connection, '0.4.0')
  await telemetry.refresh()
  return telemetry
}
describe('bounded isolated operations telemetry', () => {
  it.each([
    ['ready', 'success'], ['empty', 'empty'], ['degraded', 'degraded'], ['disabled', 'skipped'],
  ] as const)('records %s web retrieval as a platform request without inventing a supplier or inheriting the answer model', async (status, outcome) => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID(), requestId: 'answer-one', providerType: 'llm', model: 'answer-model-alias', serviceSource: 'custom' })
    const result = { status, excerpts: status === 'ready' ? [{ generatedSummary: false }] : [] }
    const retrieve = vi.fn(async () => {
      expect(operationHeaders()['X-Operation-Id']).toBe(operation?.operationId)
      expect(operationHeaders()['X-Parent-Span-Id']).not.toBe(operation?.spanId)
      return result
    })
    await expect(service.measure(operation, 'retrieval.web', retrieve, 'system', 'platform')).resolves.toBe(result)
    service.record(operation, 'llm.complete', performance.now(), 'success')
    await service.flush()
    const [web, answer] = batches.flatMap(batch => batch.events).map(event => telemetryEventSchema.parse(event))
    expect(web).toMatchObject({ stage: 'retrieval.web', providerType: 'system', serviceSource: 'platform', outcome, requestId: 'answer-one', parentSpanId: operation?.spanId, metadata: { fragmentCount: result.excerpts.length, summaryEnabled: false } })
    expect(web.model).toBeUndefined()
    expect(answer).toMatchObject({ providerType: 'llm', model: 'answer-model-alias', serviceSource: 'custom' })
    expect(retrieve).toHaveBeenCalledTimes(1)
  })
  it.each(['error', 'cancelled'] as const)('keeps web retrieval %s and correlation without a false supplier or answer model', async outcome => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID(), providerType: 'llm', model: 'answer-model-alias' })
    const error = outcome === 'cancelled' ? new DOMException('cancelled', 'AbortError') : new Error('offline')
    await expect(service.measure(operation, 'retrieval.web', async () => { throw error }, 'system', 'platform')).rejects.toBe(error)
    await service.flush()
    const [web] = batches.flatMap(batch => batch.events).map(event => telemetryEventSchema.parse(event))
    expect(web).toMatchObject({ operationId: operation?.operationId, providerType: 'system', serviceSource: 'platform', outcome })
    expect(web.model).toBeUndefined()
  })
  it('defaults disabled and closes collection when settings are unreachable', async () => {
    telemetry = new OperationsTelemetry(async () => identity, '0.4.0')
    expect(telemetry.operation({ operationId: randomUUID() })).toBeUndefined()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await telemetry.refresh()
    expect(telemetry.isEnabled()).toBe(false)
  })
  it('limits queue to 200 events and reports dropped oldest records', async () => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID() })
    for (let index = 0; index < 250; index++) service.record(operation, 'answer.prepare', performance.now(), 'success')
    for (let index = 0; index < 4; index++) await service.flush()
    expect(batches.flatMap(batch => batch.events)).toHaveLength(200)
    expect(batches[0].droppedCount).toBe(50)
    expect(batches.every(batch => batch.events.length <= 64 && Buffer.byteLength(JSON.stringify(batch)) <= 262144)).toBe(true)
  })
  it('retries the same event ID twice, then drops it without throwing', async () => {
    const service = await enable()
    service.record(service.operation({ operationId: randomUUID() }), 'answer.prepare', performance.now(), 'success')
    const ids: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { ids.push(JSON.parse(options.body).events[0].eventId); throw new TypeError('offline') }))
    const clock = vi.spyOn(Date, 'now')
    const now = Date.now()
    await service.flush(); await service.flush()
    expect(ids).toHaveLength(1)
    clock.mockReturnValue(now + 10001); await service.flush()
    clock.mockReturnValue(now + 20002); await service.flush()
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
  })
  it('does not revoke a business session on telemetry authentication failure', async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionFault(listener)
    const service = await enable()
    service.record(service.operation({ operationId: randomUUID() }), 'answer.prepare', performance.now(), 'success')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'unauthorized' }, { status: 401 })))
    await service.flush()
    await service.refresh()
    expect(listener).not.toHaveBeenCalled()
    expect(service.isEnabled()).toBe(false)
    unsubscribe()
  })
  it('drops expired data after two minutes', async () => {
    const service = await enable()
    service.record(service.operation({ operationId: randomUUID() }), 'answer.prepare', performance.now(), 'success')
    const realNow = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 120001)
    await service.flush()
    expect(batches[0]).toEqual({ events: [], droppedCount: 1 })
    vi.restoreAllMocks()
  })
  it('clears old-account data and refuses old operation completions', async () => {
    let account = identity
    const service = await enable(async () => account)
    const operation = service.operation({ operationId: randomUUID() })
    service.record(operation, 'answer.prepare', performance.now(), 'success')
    account = { ...identity, accountId: 'account-two', token: 'test-two' }
    await service.refresh()
    service.record(operation, 'llm.complete', performance.now(), 'success')
    await service.flush()
    expect(batches.flatMap(batch => batch.events)).toHaveLength(0)
    expect(batches).toHaveLength(0)
    expect(service.diagnostics().dropped).toBe(1)
  })
  it('caps total queued and in-flight events while an upload is stalled', async () => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID() })
    for (let index = 0; index < 200; index++) service.record(operation, 'answer.prepare', performance.now(), 'success')
    let complete: (() => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = () => resolve(Response.json({ accepted: 64, dropped: 0 })) })))
    const upload = service.flush()
    for (let index = 0; index < 100; index++) service.record(operation, 'answer.prepare', performance.now(), 'success')
    expect(service.diagnostics().queueSize).toBe(200)
    expect(service.diagnostics().queueBytes).toBeLessThanOrEqual(2097152)
    complete?.(); await upload
  })
  it('drains deferred full batches at healthy three answers per second without loss', async () => {
    const service = await enable()
    for (let answer = 0; answer < 90; answer++) {
      const operation = service.operation({ operationId: randomUUID() })
      for (let stage = 0; stage < 8; stage++) service.record(operation, 'answer.prepare', performance.now(), 'success')
      await new Promise(resolve => setImmediate(resolve))
      await new Promise(resolve => setImmediate(resolve))
    }
    await service.flush()
    expect(batches.flatMap(batch => batch.events)).toHaveLength(720)
    expect(service.diagnostics().dropped).toBe(0)
    expect(service.diagnostics().queueSize).toBe(0)
  })
  it('does not immediately retry a failed threshold batch and keeps offline buffering bounded', async () => {
    const service = await enable()
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetch)
    const operation = service.operation({ operationId: randomUUID() })
    for (let index = 0; index < 64; index++) service.record(operation, 'answer.prepare', performance.now(), 'success')
    await new Promise(resolve => setImmediate(resolve))
    await new Promise(resolve => setImmediate(resolve))
    for (let index = 0; index < 250; index++) service.record(operation, 'answer.prepare', performance.now(), 'success')
    await new Promise(resolve => setImmediate(resolve))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(service.diagnostics().queueSize).toBe(200)
    expect(service.diagnostics().dropped).toBe(114)
  })
  it('reuses bounded recent answer contexts only within the same account and session', async () => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID(), requestId: 'answer-one', sessionId: 'session-one' })
    expect(service.forRequest('answer-one', 'session-one')).toBe(operation)
    expect(service.forRequest('answer-one', 'different-session')).toBeUndefined()
    for (let index = 0; index < 128; index++) service.operation({ operationId: randomUUID(), requestId: `answer-${index + 2}` })
    expect(service.forRequest('answer-one')).toBeUndefined()
    const clock = vi.spyOn(Date, 'now')
    clock.mockReturnValue(Date.now() + 600001)
    expect(service.forRequest('answer-129')).toBeUndefined()
    clock.mockRestore()
    service.operation({ operationId: randomUUID(), requestId: 'before-reset' })
    expect(service.forRequest('before-reset')).toBeDefined()
    service.reset(true)
    expect(service.forRequest('before-reset')).toBeUndefined()
  })
  it('rejects content, secrets, unknown metadata, spoofed sources and invalid durations', async () => {
    const service = await enable()
    const event = { eventId: randomUUID(), spanId: randomUUID(), operationId: randomUUID(), stage: 'answer.prepare', source: 'desktop', providerType: 'system', startedAt: new Date().toISOString(), durationMs: 1, outcome: 'success' }
    for (const patch of [{ question: 'private' }, { apiKey: 'secret' }, { source: 'backend' }, { durationMs: Infinity }, { metadata: { unexpected: 'private' } }]) service.enqueue({ ...event, ...patch })
    await service.flush()
    expect(batches).toHaveLength(0)
    expect(telemetryEventSchema.safeParse(event).success).toBe(true)
  })
  it('uses the server feedback reason taxonomy without rejecting the rest of a batch', async () => {
    const service = await enable()
    const event = { eventId: randomUUID(), spanId: randomUUID(), operationId: randomUUID(), stage: 'auto.feedback', source: 'desktop', providerType: 'system', startedAt: new Date().toISOString(), durationMs: 0, outcome: 'skipped', reason: 'feedback', metadata: { filteredCount: 1 } }
    expect(telemetryEventSchema.safeParse(event).success).toBe(true)
    expect(telemetryEventSchema.safeParse({ ...event, reason: 'filtered' }).success).toBe(false)
    service.enqueue(event)
    await service.flush()
    expect(batches[0].events).toHaveLength(1)
  })
  it.each(['record_changed', 'record_deleted', 'secret raw failure'])('only records safe sync failure reasons (%s)', async reason => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID() })
    const error = Object.assign(new Error('sensitive response body'), { reason })
    await expect(service.measure(operation, 'session.sync', async () => { throw error })).rejects.toBe(error)
    await service.flush()
    const event = batches[0].events[0]
    expect(event).toMatchObject({ outcome: 'error', stage: 'session.sync' })
    expect((event as { reason?: string }).reason).toBe(reason.startsWith('record_') ? reason : undefined)
    expect(JSON.stringify(event)).not.toContain('sensitive')
    expect(JSON.stringify(event)).not.toContain('secret raw')
  })
  it('propagates matching asynchronous stage span headers without leaking outside context', async () => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID() })
    let headers: Record<string, string> = {}
    await service.measure(operation, 'retrieval.rag', async () => { await Promise.resolve(); headers = operationHeaders(); return { status: 'empty', excerpts: [] } }, 'pg')
    expect(operationHeaders()).toEqual({})
    await service.flush()
    expect(batches[0].events[0]).toMatchObject({ spanId: headers['X-Parent-Span-Id'], operationId: headers['X-Operation-Id'], stage: 'retrieval.rag', outcome: 'empty' })
  })
  it.each([false, true])('measures only effective model text and actual supplier usage (platform=%s)', async platform => {
    const service = await enable()
    const operation = service.operation({ operationId: randomUUID(), model: 'test-model', providerType: 'llm', serviceSource: platform ? 'platform' : 'custom' })
    let modelHeaders: Headers | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/telemetry/operations')) { batches.push(JSON.parse(String(options?.body))); return Response.json({ accepted: 3, dropped: 0 }) }
      modelHeaders = new Headers(options?.headers)
      return new Response('data: {"choices":[{"delta":{"content":" "}}]}\n\ndata: {"choices":[{"delta":{}}]}\n\ndata: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4,"total_tokens":16}}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    }))
    const settings = { ...structuredClone(defaultSettings), llm: { ...defaultSettings.llm, baseUrl: identity.baseUrl + '/v1' } }
    await new LlmClient(settings, 'test-key', () => undefined, platform, service, operation).generate({ requestId: 'test-request', question: 'test?', transcript: '' })
    await service.flush()
    expect(batches.flatMap(batch => batch.events).filter(event => (event as { stage: string }).stage === 'llm.first_content')).toHaveLength(1)
    expect(batches[0].events).toContainEqual(expect.objectContaining({ stage: 'llm.complete', metadata: expect.objectContaining({ inputTokens: 12, outputTokens: 4, totalTokens: 16 }) }))
    expect(modelHeaders?.has('X-Operation-Id')).toBe(platform)
  })
})
