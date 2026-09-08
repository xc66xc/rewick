import { z } from 'zod'
export const adminSchema = z.object({ id: z.string(), username: z.string(), role: z.string() })
export type Admin = z.infer<typeof adminSchema>
export const loginSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.string(), user: z.object({ id: z.string(), username: z.string() }) })
export const userSchema = adminSchema.extend({ enabled: z.boolean(), dailyAnswers: z.number().int(), dailyKnowledgeQueries: z.number().int(), createdAt: z.string() })
export type User = z.infer<typeof userSchema>
export interface NewUser { username: string; password: string; dailyAnswers: number; dailyKnowledgeQueries: number }
export interface UserUpdate { enabled: boolean; dailyAnswers: number; dailyKnowledgeQueries: number }
export const usageSchema = z.object({ id: z.string(), userId: z.string(), username: z.string(), requestId: z.string(), capability: z.string(), model: z.string().nullable(), status: z.string(), createdAt: z.string(), finishedAt: z.string().nullable() })
export const auditSchema = z.object({ id: z.string(), actorId: z.string(), actorUsername: z.string(), action: z.string(), target: z.string(), createdAt: z.string() })
export function pageSchema<T extends z.ZodType>(item: T) { return z.object({ items: z.array(item), total: z.number(), page: z.number(), size: z.number() }) }
export const usersSchema = pageSchema(userSchema)
export const usagePageSchema = pageSchema(usageSchema)
export const auditPageSchema = pageSchema(auditSchema)
export interface Page<T> { items: T[]; total: number; page: number; size: number }
export type Capability = 'llm' | 'asr' | 'knowledge'
const providerSchema = z.object({ id: z.string(), name: z.string(), kind: z.enum(['llm', 'asr', 'knowledge']), url: z.string(), enabled: z.boolean(), hasApiKey: z.boolean().optional() })
export interface Provider extends z.infer<typeof providerSchema> { apiKey?: string }
const modelSchema = z.object({ id: z.string(), name: z.string(), providerId: z.string(), model: z.string(), enabled: z.boolean(), maxOutputTokens: z.number() })
export type Model = z.infer<typeof modelSchema>
export const configSchema = z.object({ version: z.number(), providers: z.array(providerSchema), models: z.array(modelSchema), defaultModelId: z.string(), asr: z.object({ enabled: z.boolean(), providerId: z.string(), model: z.string() }), knowledge: z.object({ enabled: z.boolean(), providerId: z.string(), agentId: z.string() }) })
export interface Config extends Omit<z.infer<typeof configSchema>, 'providers'> { providers: Provider[] }
export const testSchema = z.object({ success: z.boolean(), message: z.string(), latencyMs: z.number() })
export const capabilityNames: Record<Capability, string> = { llm: '回答模型', asr: '语音转写', knowledge: '远程知识库' }
export const statusNames: Record<string, string> = { started: '进行中', complete: '已完成', failed: '失败', cancelled: '已取消', expired: '已过期' }
export function dateTime(value: string | null): string { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' }
export function cleanSecrets(config: Config): Config { return { ...config, providers: config.providers.map(({ apiKey: _key, ...provider }) => provider) } }
export function configPayload(config: Config) { return { ...config, providers: config.providers.map(({ hasApiKey: _saved, ...provider }) => ({ ...provider, apiKey: provider.apiKey?.trim() || undefined })) } }
export function passwordError(password: string): string { return password.length < 12 || new TextEncoder().encode(password).length > 72 ? '密码至少 12 个字符，且不超过 72 个 UTF-8 字节。' : '' }
