import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import type { ReferenceExcerpt, RetrievalContext, SessionRecord } from '../../src/shared/types'
import { retrievalContextSchema, sessionRecordSchema } from '../../src/main/services/validation'
import { createAnswerWorkbook } from '../../src/main/services/answer-excel-export'
import { sessionToMarkdown } from '../../src/main/services/history-store'
import { ServerHistory } from '../../src/main/services/server-history'
import { defaultSettings } from '../../src/shared/defaults'
import { retrieveAnswerContext } from '../../src/main/services/answer-retrieval'
import { telemetryEventSchema } from '../../src/shared/telemetry'

const local = (index: number): ReferenceExcerpt => ({ source: 'platform', documentId: `doc-${index}`, revision: 1, name: '资料.md', kind: 'technical', chunkId: `chunk-${index}`, text: `参考正文 ${index}`, ranking: { bm25Rank: 20, vectorRank: 20, rrfScore: 0.02, rerankRank: null, rerankScore: null } })
const web = (index: number): ReferenceExcerpt => ({ source: 'web', documentId: `web-${index}`, revision: 1, name: '网页', kind: 'technical', chunkId: `web-${index}`, url: `https://example.test/${index}`, text: `网页正文 ${index}` })
function retrieval(): RetrievalContext {
  return { status: 'ready', excerpts: Array.from({ length: 40 }, (_, index) => local(index)), hybrid: {
    bm25: { status: 'ready', candidateCount: 20, durationMs: 4, topK: 20 }, vector: { status: 'ready', candidateCount: 20, durationMs: 50, topK: 20 },
    fusion: { method: 'rrf', rankConstant: 60, candidateCount: 40, selectedCount: 40, topN: 40, resultCount: 40 },
    rerank: { status: 'disabled', model: '', candidateCount: 40, resultCount: 40, topN: 20, durationMs: 0, reason: null },
  } }
}
function session(context: RetrievalContext): SessionRecord {
  return { id: 'session', title: '检索测试', createdAt: '2026-11-11T03:00:00Z', segments: [], answers: [{ id: 'answer', question: '当前问题', text: '已生成回答', createdAt: '2026-11-11T03:00:00Z', status: 'complete', retrieval: context }] }
}

describe('reference rerank response and saved-session contracts', () => {
  let directory = ''
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'rerank-contract-')) })
  afterEach(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }) })

  it('accepts forty local excerpts plus twenty web excerpts and one generated summary without dropping metadata', async () => {
    const online: RetrievalContext = { status: 'ready', web: { status: 'ready' }, excerpts: [...Array.from({ length: 20 }, (_, index) => web(index)), { ...web(20), url: undefined, generatedSummary: true }] }
    const combined = await retrieveAnswerContext(async () => retrieval(), async () => online, new AbortController().signal)
    const parsed = retrievalContextSchema.parse(combined)
    expect(parsed.excerpts).toHaveLength(61)
    expect(parsed).toEqual(combined)
    expect(sessionRecordSchema.parse(session(parsed)).answers[0].retrieval).toEqual(combined)
    expect(retrievalContextSchema.safeParse({ ...combined, excerpts: [...combined.excerpts, local(41)] }).success).toBe(false)
  })
  it.each(['ready', 'degraded', 'skipped'] as const)('reads %s rerank with forty candidate ranks and twenty retained excerpts', status => {
    const context = retrieval()
    if (!context.hybrid?.rerank) throw new Error('Missing fixture rerank')
    context.excerpts = context.excerpts.slice(0, 20).map(excerpt => ({ ...excerpt, ranking: { ...excerpt.ranking, rrfScore: .02, rerankRank: 40, rerankScore: -.1 } }))
    context.hybrid.fusion.resultCount = 20
    context.hybrid.rerank = { ...context.hybrid.rerank, status, model: 'qwen3-rerank', resultCount: 20, reason: status === 'ready' ? null : 'protocol_error' }
    expect(retrievalContextSchema.parse(context)).toEqual(context)
  })
  it('keeps old history readable without rerank or new branch/fusion fields', () => {
    const old: RetrievalContext = { status: 'ready', excerpts: [local(0)], hybrid: {
      bm25: { status: 'ready', candidateCount: 4, durationMs: 5 }, vector: { status: 'ready', candidateCount: 4, durationMs: 20 }, fusion: { method: 'rrf', rankConstant: 60, resultCount: 1 },
    } }
    delete old.excerpts[0].ranking?.rerankRank; delete old.excerpts[0].ranking?.rerankScore
    expect(sessionRecordSchema.parse(session(old)).answers[0].retrieval).toEqual(old)
    expect(sessionToMarkdown(session(old))).toContain('已生成回答')
  })
  it.each([
    { bm25: { status: 'ready', candidateCount: 21, durationMs: 0 } },
    { vector: { status: 'ready', candidateCount: 20, durationMs: 0, topK: 21 } },
    { fusion: { method: 'rrf', rankConstant: 60, resultCount: 41 } },
    { fusion: { method: 'rrf', rankConstant: 60, resultCount: 2, selectedCount: 41 } },
    { fusion: { method: 'rrf', rankConstant: 60, resultCount: 2, candidateCount: 41 } },
  ])('rejects out-of-contract counts %j', fields => {
    const value = retrieval()
    expect(retrievalContextSchema.safeParse({ ...value, hybrid: { ...value.hybrid, ...fields } }).success).toBe(false)
  })
  it('rejects rank 41 and non-finite rerank scores', () => {
    const value = retrieval()
    for (const ranking of [{ rerankRank: 41, rerankScore: .1 }, { rerankRank: 1, rerankScore: Infinity }, { bm25Rank: 21 }, { vectorRank: 21 }]) {
      expect(retrievalContextSchema.safeParse({ ...value, excerpts: [{ ...local(0), ranking: { rrfScore: .02, ...ranking } }] }).success).toBe(false)
    }
  })
  it('supports rerank observability without accepting content or credentials as metadata', () => {
    const event = { eventId: '33333333-3333-4333-8333-333333333333', operationId: '11111111-1111-4111-8111-111111111111', spanId: '22222222-2222-4222-8222-222222222222', stage: 'retrieval.rerank', source: 'desktop', startedAt: '2026-11-11T03:00:00Z', durationMs: 80, outcome: 'degraded', reason: 'protocol_error', providerType: 'rerank', model: 'qwen3-rerank', metadata: { candidateCount: 40, selectedCount: 20, resultCount: 20, topK: 20, topN: 20, rrfTopN: 40, rerankTopN: 20, policyVersion: 3, platformVersion: 8 } }
    expect(telemetryEventSchema.parse(event)).toEqual(event)
    expect(telemetryEventSchema.safeParse({ ...event, metadata: { ...event.metadata, apiKey: 'fixture-secret' } }).success).toBe(false)
    expect(telemetryEventSchema.safeParse({ ...event, metadata: { ...event.metadata, query: 'private query' } }).success).toBe(false)
  })
  it('round-trips larger retrieval and rerank metadata through encrypted drafts, server history and exports', async () => {
    const crypto = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')), decryptString: (value: Buffer) => value.toString().split('').reverse().join('') }
    const auth = async () => ({ settings: { ...defaultSettings, platform: { ...defaultSettings.platform, enabled: true, authenticated: true, baseUrl: 'https://platform.example', capabilities: { llm: false, asr: false }, models: { llm: '', asr: '' } } }, secrets: { platformAccessToken: 'fixture-token', llmApiKey: '', asrApiKey: '' } })
    const record = session(retrieval())
    await new ServerHistory(directory, crypto, auth).saveDraft(record)
    const restarted = new ServerHistory(directory, crypto, auth)
    expect(await restarted.localDraft(record.id)).toEqual(record)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ version: 1, record })))
    expect(await restarted.detail(record.id)).toEqual(record)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(await createAnswerWorkbook(record)).buffer)
    expect(JSON.parse(String(workbook.getWorksheet('data')?.getCell('D2').value))).toEqual(record.answers[0].retrieval?.excerpts.map(excerpt => excerpt.text))
    expect(sessionToMarkdown(record)).toContain('已生成回答')
  })
})
