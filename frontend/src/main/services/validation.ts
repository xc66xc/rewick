import { algorithmLanguages } from '../../shared/algorithm-answer'
import { productionPlatformUrl } from '../../shared/platform-transport'
import { z } from 'zod'
import { webSourceUrlSchema } from '../../shared/web-search'
import { environmentSnapshotSchema } from './interview-validation'
import { isQuestionExtraction, questionIdSchema, questionRewriteContextSchema, questionRewriteResultSchema } from '../../shared/question-rewrite'

export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

export function endpoint(protocol: 'http' | 'ws') {
  return z.string().trim().min(1).max(2048).refine((value) => {
    try {
      const url = new URL(value)
      return !url.username && !url.password && !url.hash &&
        (url.protocol === `${protocol}s:` || url.protocol === `${protocol}:`)
    } catch { return false }
  }, `地址必须使用 ${protocol.toUpperCase()} 或 ${protocol.toUpperCase()}S；地址不能包含账号、密码或片段。`)
}

const apiKey = z.string().trim().max(4096).refine((value) => !/[\r\n]/.test(value), 'API Key 不能包含换行。').optional()
export const asrSettingsSchema = z.object({
  url: endpoint('ws'), model: z.string().trim().min(1).max(200),
  silenceMs: z.number().int().min(200).max(6000),
})
export const llmSettingsSchema = z.object({
  baseUrl: endpoint('http'), model: z.string().trim().min(1).max(200),
  temperature: z.number().finite().min(0).max(2),
})
export const interviewTargetSchema = z.object({
  companyName: z.string().trim().max(200), roleName: z.string().trim().max(200), jobDescription: z.string().max(12_000),
})
export const referencePatchSchema = z.object({ enabled: z.boolean().optional(), kind: z.enum(['technical', 'personal']).optional() }).strict()
export const referenceExcerptSchema = z.object({
    excerptId: z.string().min(1).max(200).optional(), questionIds: z.array(questionIdSchema).min(1).max(5).optional(),
    source: z.enum(['platform', 'web']).optional(),
    generatedSummary: z.boolean().optional(),
    url: webSourceUrlSchema.optional(), title: z.string().max(255).optional(), score: z.number().finite().optional(),
    documentId: z.string().min(1).max(128), revision: z.number().int().positive(),
    name: z.string().max(255), kind: z.enum(['technical', 'personal']), chunkId: z.string().min(1).max(200),
    text: z.string().max(2000), paragraphStart: z.number().int().nonnegative().optional(), paragraphEnd: z.number().int().nonnegative().optional(),
    sectionPath: z.string().max(512).optional(), matchedChunkIds: z.array(z.string().max(128)).max(10).optional(),
    contextExpansion: z.enum(['parent', 'child', 'partial']).optional(),
    ranking: z.object({ bm25Rank: z.number().int().min(1).max(20).nullable().optional(), vectorRank: z.number().int().min(1).max(20).nullable().optional(),
      bm25Score: z.number().finite().nonnegative().nullable().optional(), vectorScore: z.number().finite().nullable().optional(), rrfScore: z.number().finite().nonnegative(),
      rerankRank: z.number().int().min(1).max(40).nullable().optional(), rerankScore: z.number().finite().nullable().optional() }).optional(),
  }).superRefine((value, context) => {
    if (value.generatedSummary && (value.source !== 'web' || value.url !== undefined || value.kind !== 'technical')) context.addIssue({ code: 'custom', message: '生成摘要只能作为联网技术参考，不能伪造网页来源。' })
    if (value.source === 'web' && ((!value.generatedSummary && !value.url) || value.kind !== 'technical')) context.addIssue({ code: 'custom', message: '网页资料必须包含来源 URL，且只能作为技术参考。' })
  })
const recallBranchSchema = z.object({ status: z.enum(['ready', 'empty', 'degraded']), candidateCount: z.number().int().min(0).max(20), durationMs: z.number().finite().nonnegative(), topK: z.number().int().min(1).max(20).nullable().optional() })
export const hybridSchema = z.object({
  bm25: recallBranchSchema, vector: recallBranchSchema,
  fusion: z.object({ method: z.literal('rrf'), rankConstant: z.number().int().positive(), resultCount: z.number().int().min(0).max(40),
    candidateCount: z.number().int().min(0).max(40).nullable().optional(), selectedCount: z.number().int().min(0).max(40).nullable().optional(), topN: z.number().int().min(1).max(40).nullable().optional() }),
  rerank: z.object({ status: z.enum(['disabled', 'ready', 'degraded', 'skipped']), model: z.string().max(200).nullable(), candidateCount: z.number().int().min(0).max(40),
    resultCount: z.number().int().min(0).max(40), topN: z.number().int().min(1).max(20), durationMs: z.number().finite().nonnegative(), reason: z.string().max(80).nullable().optional() }).nullable().optional(),
})
const webRetrievalSchema = z.object({ status: z.enum(['ready', 'degraded', 'empty']), message: z.string().max(2000).optional() })
export const queryRetrievalSchema = z.object({
  questionId: questionIdSchema, status: z.enum(['disabled', 'ready', 'degraded', 'empty']), message: z.string().max(2000).optional(),
  hybrid: hybridSchema.nullable().optional(), excerptIds: z.array(z.string().min(1).max(200)).max(61),
  referenceStatus: z.enum(['disabled', 'ready', 'degraded', 'empty']).optional(), web: webRetrievalSchema.optional(),
})
const retrievalContextObjectSchema = z.object({
  status: z.enum(['disabled', 'ready', 'degraded', 'empty']), message: z.string().max(2000).optional(),
  excerpts: z.array(referenceExcerptSchema).max(61),
  hybrid: hybridSchema.nullable().optional(),
  web: webRetrievalSchema.optional(), queries: z.array(queryRetrievalSchema).min(1).max(5).optional(),
  policyVersion: z.number().int().nonnegative().optional(), platformVersion: z.number().int().nonnegative().optional(),
})
export const retrievalContextSchema = retrievalContextObjectSchema.superRefine((value, context) => {
  if (!value.queries) return
  const queries = value.queries
  const ids = new Set(queries.map(query => query.questionId))
  const excerpts = new Map(value.excerpts.map(excerpt => [excerpt.excerptId, excerpt]))
  const summaries = value.excerpts.filter(excerpt => excerpt.generatedSummary)
  if (ids.size !== queries.length || excerpts.size !== value.excerpts.length || value.hybrid !== undefined
    || value.excerpts.filter(excerpt => excerpt.source === 'web').reduce((sum, excerpt) => sum + excerpt.text.length, 0) > 8000
    || value.excerpts.filter(excerpt => excerpt.source !== 'web').reduce((sum, excerpt) => sum + excerpt.text.length, 0) > 4800
    || summaries.length > queries.length
    || queries.some(query => summaries.filter(excerpt => excerpt.questionIds?.includes(query.questionId)).length > 1)
    || value.excerpts.some(excerpt => !excerpt.excerptId || !excerpt.questionIds?.length
      || new Set(excerpt.questionIds).size !== excerpt.questionIds.length
      || excerpt.questionIds.some(id => !ids.has(id) || !queries.some(query => query.questionId === id && query.excerptIds.includes(excerpt.excerptId ?? ''))))
    || queries.some(query => new Set(query.excerptIds).size !== query.excerptIds.length || query.excerptIds.some(id => !excerpts.get(id)?.questionIds?.includes(query.questionId)))) {
    context.addIssue({ code: 'custom', message: '分题证据归属或材料预算无效。' })
  }
})
export const batchReferenceResponseSchema = retrievalContextObjectSchema.extend({ queries: z.array(queryRetrievalSchema).min(1).max(5) }).strict()
  .superRefine((value, context) => {
    const ids = new Set(value.queries.map(query => query.questionId))
    const excerpts = new Map(value.excerpts.map(excerpt => [excerpt.excerptId, excerpt]))
    if (ids.size !== value.queries.length || excerpts.size !== value.excerpts.length
      || value.hybrid !== undefined || value.web !== undefined
      || value.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0) > 4800
      || value.excerpts.some(excerpt => !excerpt.excerptId || excerpt.source === 'web' || !excerpt.questionIds?.length
        || new Set(excerpt.questionIds).size !== excerpt.questionIds.length
        || excerpt.questionIds.some(id => !ids.has(id) || !value.queries.some(query => query.questionId === id && query.excerptIds.includes(excerpt.excerptId ?? ''))))
      || value.queries.some(query => new Set(query.excerptIds).size !== query.excerptIds.length || query.excerptIds.some(id => !excerpts.get(id)?.questionIds?.includes(query.questionId)))) {
      context.addIssue({ code: 'custom', message: '分题资料响应存在无效证据归属或超过预算。' })
    }
  })
export const platformSettingsSchema = z.object({
  enabled: z.boolean(),
  baseUrl: endpoint('http').refine(value => !new URL(value).search, '平台地址不能包含查询参数。').transform(value => value.replace(/\/$/, '')),
  selectedModelId: z.string().trim().max(200).optional(),
})
export const settingsInputSchema = z.object({
  preferencesVersion: z.number().int().nonnegative().optional(),
  serviceSelections: z.object({
    llm: z.object({ source: z.enum(['platform', 'custom']), id: z.string().max(200) }).optional(),
    asr: z.object({ source: z.enum(['platform', 'custom']), id: z.string().max(200) }).optional(),
  }).optional(),
  platform: platformSettingsSchema.default({ enabled: false, baseUrl: productionPlatformUrl }),
  asr: asrSettingsSchema.extend({ apiKey }),
  llm: llmSettingsSchema.extend({ apiKey }),
  context: z.object({ name: z.string().max(255), text: z.string().max(100_000) }),
  interviewTarget: interviewTargetSchema.default({ companyName: '', roleName: '', jobDescription: '' }),
  retrieval: z.object({ enabled: z.boolean() }).default({ enabled: false }),
  webSearch: z.object({ enabled: z.boolean() }).default({ enabled: false }),
  answerStyle: z.enum(['concise', 'detailed']),
  autoAnswer: z.object({ enabled: z.boolean(), pauseMs: z.number().int().min(1000).max(5000) })
    .default({ enabled: true, pauseMs: 1500 }),
})
export const answerRequestSchema = z.object({
  mode: z.literal('algorithm').optional(), language: z.enum(algorithmLanguages).optional(),
  algorithmContext: z.string().max(50_000).optional(),
  operationId: z.string().uuid().optional(), autoWaitMs: z.number().finite().nonnegative().max(86400000).optional(),
  requestId: z.string().min(1).max(128),
  question: z.string().trim().min(1, '请先输入问题或等待字幕。').max(20_000),
  transcript: z.string().max(100_000),
  rewriteContext: questionRewriteContextSchema.optional(),
  environmentId: z.string().min(1).max(128).optional(),
})
export const modelInputSnapshotSchema = z.object({
  model: z.string().min(1).max(200),
  // A user message combines all input fields, including JSON escape sequences.
  messages: z.array(z.object({ role: z.enum(['system', 'user']), content: z.string().max(1_500_000) })).min(1).max(2),
})
const timestamp = z.string().datetime({ offset: true })
export const sessionRecordSchema = z.object({
  id: z.string().min(1).max(128), createdAt: timestamp,
  title: z.string().trim().min(1).max(200),
  interviewEnvironment: environmentSnapshotSchema.optional(),
  interviewSessionId: z.string().max(128).optional(),
  segments: z.array(z.object({
    id: z.string().min(1).max(160), text: z.string().max(20_000),
    startMs: z.number().finite().nonnegative(), endMs: z.number().finite().nonnegative().optional(),
    isFinal: z.boolean(), isEdited: z.boolean().optional(),
  }).refine((segment) => segment.endMs === undefined || segment.endMs >= segment.startMs, '字幕结束时间不能早于开始时间。')).max(10_000),
  answers: z.array(z.object({
    id: z.string().min(1).max(128), question: z.string().max(20_000), text: z.string().max(100_000),
    createdAt: timestamp, status: z.enum(['streaming', 'complete', 'cancelled', 'error']),
    mode: z.literal('algorithm').optional(), language: z.enum(algorithmLanguages).optional(),
    algorithmRootId: z.string().min(1).max(128).optional(),
    error: z.string().max(2000).optional(),
    interviewTarget: interviewTargetSchema.optional(), retrieval: retrievalContextSchema.optional(),
    modelInput: modelInputSnapshotSchema.optional(),
    questionRewrite: questionRewriteResultSchema.optional(),
    interviewEnvironment: environmentSnapshotSchema.optional(),
  }).superRefine((answer, context) => {
    const extracted = isQuestionExtraction(answer.questionRewrite) && answer.questionRewrite.status === 'rewritten' ? answer.questionRewrite.questions : undefined
    const queries = answer.retrieval?.queries
    if (extracted?.some(question => question.sourceTexts.some(text => !answer.question.includes(text)))
      || queries && (!extracted || queries.length !== extracted.length || queries.some((query, index) => query.questionId !== extracted[index]?.id))) {
      context.addIssue({ code: 'custom', message: '提取问题必须来源于本轮原话，且与分题证据一一对应。' })
    }
  })).max(500),
})

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error(`配置或输入无效：${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`)
  }
  return result.data
}
