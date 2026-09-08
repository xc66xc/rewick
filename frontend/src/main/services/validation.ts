import { z } from 'zod'
import { environmentSnapshotSchema } from './interview-validation'

export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

export function endpoint(protocol: 'http' | 'ws') {
  return z.string().trim().min(1).max(2048).refine((value) => {
    try {
      const url = new URL(value)
      return !url.username && !url.password && !url.hash &&
        (url.protocol === `${protocol}s:` || (url.protocol === `${protocol}:` && isLoopback(url.hostname)))
    } catch { return false }
  }, `远程地址必须使用 ${protocol.toUpperCase()}S，仅本机回环地址允许 ${protocol.toUpperCase()}；地址不能包含账号、密码或片段。`)
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
export const embeddingSettingsSchema = z.object({
  baseUrl: endpoint('http'), model: z.string().trim().min(1).max(200), dimensions: z.number().int().min(64).max(4096),
})
const remoteKnowledgeBaseSchema = z.object({
  enabled: z.boolean(),
  url: z.union([z.literal(''), endpoint('http')]).refine(value => !/[{}]|%7[bd]/i.test(value), '请将请求地址中的业务空间占位符替换为真实 Workspace ID。'),
  agentId: z.string().trim().max(200).refine(value => !/\s/.test(value), 'Agent ID 不能包含空白字符。'),
})
export const remoteKnowledgeSettingsSchema = remoteKnowledgeBaseSchema.superRefine((value, context) => {
  if (!value.enabled) return
  if (!value.url) context.addIssue({ code: 'custom', path: ['url'], message: '启用远程知识库前请填写完整检索请求地址。' })
  if (!value.agentId) context.addIssue({ code: 'custom', path: ['agentId'], message: '启用远程知识库前请填写 Agent ID。' })
})
export const referencePatchSchema = z.object({ enabled: z.boolean().optional(), kind: z.enum(['technical', 'personal']).optional() }).strict()
export const retrievalContextSchema = z.object({
  status: z.enum(['disabled', 'ready', 'degraded', 'empty']), message: z.string().max(2000).optional(),
  excerpts: z.array(z.object({
    source: z.enum(['local', 'bailian']).optional(),
    documentId: z.string().min(1).max(128), revision: z.number().int().positive(),
    name: z.string().max(255), kind: z.enum(['technical', 'personal']), chunkId: z.string().min(1).max(200),
    text: z.string().max(2000), pageStart: z.number().int().positive().max(100_000).optional(), pageEnd: z.number().int().positive().max(100_000).optional(),
  })).max(12),
  remote: z.object({ agentId: z.string().max(200), status: z.enum(['ready', 'degraded', 'empty']), message: z.string().max(2000).optional() }).optional(),
})
export const platformSettingsSchema = z.object({
  enabled: z.boolean(),
  baseUrl: endpoint('http').refine(value => !new URL(value).search, '平台地址不能包含查询参数。').transform(value => value.replace(/\/$/, '')),
  selectedModelId: z.string().trim().max(200).optional(),
})
export const settingsInputSchema = z.object({
  platform: platformSettingsSchema.default({ enabled: false, baseUrl: 'http://127.0.0.1:8080' }),
  asr: asrSettingsSchema.extend({ apiKey }),
  llm: llmSettingsSchema.extend({ apiKey }),
  context: z.object({ name: z.string().max(255), text: z.string().max(100_000) }),
  interviewTarget: interviewTargetSchema.default({ companyName: '', roleName: '', jobDescription: '' }),
  embedding: embeddingSettingsSchema.extend({ apiKey }).default({ baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'text-embedding-v4', dimensions: 1024 }),
  retrieval: z.object({ enabled: z.boolean() }).default({ enabled: false }),
  remoteKnowledge: remoteKnowledgeBaseSchema.extend({ apiKey }).default({ enabled: false, url: '', agentId: '' }),
  answerStyle: z.enum(['concise', 'detailed']),
  autoAnswer: z.object({ enabled: z.boolean(), pauseMs: z.number().int().min(1000).max(5000) })
    .default({ enabled: true, pauseMs: 1500 }),
}).superRefine((value, context) => {
  if (value.remoteKnowledge.enabled && (!value.platform.enabled || value.remoteKnowledge.apiKey)) {
    const remote = remoteKnowledgeSettingsSchema.safeParse(value.remoteKnowledge)
    if (!remote.success) for (const issue of remote.error.issues) context.addIssue({ ...issue, path: ['remoteKnowledge', ...issue.path] })
  }
})
export const answerRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  question: z.string().trim().min(1, '请先输入问题或等待字幕。').max(20_000),
  transcript: z.string().max(100_000),
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
  segments: z.array(z.object({
    id: z.string().min(1).max(160), text: z.string().max(20_000),
    startMs: z.number().finite().nonnegative(), endMs: z.number().finite().nonnegative().optional(),
    isFinal: z.boolean(), isEdited: z.boolean().optional(),
  }).refine((segment) => segment.endMs === undefined || segment.endMs >= segment.startMs, '字幕结束时间不能早于开始时间。')).max(10_000),
  answers: z.array(z.object({
    id: z.string().min(1).max(128), question: z.string().max(20_000), text: z.string().max(100_000),
    createdAt: timestamp, status: z.enum(['streaming', 'complete', 'cancelled', 'error']),
    error: z.string().max(2000).optional(),
    interviewTarget: interviewTargetSchema.optional(), retrieval: retrievalContextSchema.optional(),
    modelInput: modelInputSnapshotSchema.optional(),
    interviewEnvironment: environmentSnapshotSchema.optional(),
  })).max(500),
})

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error(`配置或输入无效：${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`)
  }
  return result.data
}
