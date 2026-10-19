import { z } from 'zod'
export const adminSchema = z.object({ id: z.string(), displayName: z.string(), role: z.string() })
export type Admin = z.infer<typeof adminSchema>
export const loginSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.string(), user: z.object({ id: z.string(), displayName: z.string() }) })
export const userSchema = adminSchema.extend({ enabled: z.boolean(), availableSeconds: z.number().int().nonnegative(), walletVersion: z.number().int().nonnegative(), createdAt: z.string() })
export type User = z.infer<typeof userSchema>
export interface NewUser { identifier: string; password: string; availableSeconds: number }
export interface UserUpdate { enabled: boolean }
export const usageSchema = z.object({ id: z.string(), userId: z.string(), displayName: z.string(), requestId: z.string(), capability: z.string(), operationId: z.uuid().optional(), model: z.string().nullable(), status: z.string(), createdAt: z.string(), finishedAt: z.string().nullable() })
export const auditSchema = z.object({ id: z.string(), actorId: z.string(), actorDisplayName: z.string(), action: z.string(), target: z.string(), createdAt: z.string() })
export function pageSchema<T extends z.ZodType>(item: T) { return z.object({ items: z.array(item), total: z.number(), page: z.number(), size: z.number() }) }
export const usersSchema = pageSchema(userSchema)
export const usagePageSchema = pageSchema(usageSchema)
export const auditPageSchema = pageSchema(auditSchema)
export interface Page<T> { items: T[]; total: number; page: number; size: number }
export type Capability = 'llm' | 'asr' | 'embedding' | 'web-search'
const providerSchema = z.object({ id: z.string(), name: z.string(), kind: z.enum(['llm', 'asr', 'embedding', 'web-search']), url: z.string(), enabled: z.boolean(), hasApiKey: z.boolean().optional() })
export interface Provider extends z.infer<typeof providerSchema> { apiKey?: string }
const modelSchema = z.object({ id: z.string(), name: z.string(), providerId: z.string(), model: z.string(), enabled: z.boolean(), maxOutputTokens: z.number() })
export type Model = z.infer<typeof modelSchema>
export const searchDepthSchema = z.enum(['advanced', 'basic', 'fast', 'ultra-fast'])
export const searchDepthNames: Record<z.infer<typeof searchDepthSchema>, string> = { advanced: '高级搜索', basic: '基础搜索', fast: '快速搜索', 'ultra-fast': '极速搜索' }
export const defaultWebSearch = { enabled: false, providerId: '', topK: 5, searchDepth: 'advanced' as const, timeoutMs: 8000, includeAnswer: 'none' as const }
export const webSearchSchema = z.object({ enabled: z.boolean(), providerId: z.string(), topK: z.number().int().min(1).max(20), searchDepth: searchDepthSchema, timeoutMs: z.number().int().min(1000).max(30000), includeAnswer: z.enum(['none', 'basic', 'advanced']).default('none') })
export const configSchema = z.object({ version: z.number(), providers: z.array(providerSchema), models: z.array(modelSchema), defaultModelId: z.string(), asr: z.object({ enabled: z.boolean(), providerId: z.string(), model: z.string() }), embedding: z.object({ enabled: z.boolean(), providerId: z.string(), model: z.string(), dimensions: z.literal(1024) }), webSearch: webSearchSchema.default(defaultWebSearch) })
export interface Config extends Omit<z.infer<typeof configSchema>, 'providers'> { providers: Provider[] }
export const testSchema = z.object({ success: z.boolean(), message: z.string(), latencyMs: z.number() })
export const emailConfigSchema = z.object({ version: z.number().int().nonnegative(), enabled: z.boolean(), host: z.string().max(253), port: z.number().int().min(1).max(65535), username: z.string().max(254), hasPassword: z.boolean(), from: z.string().max(254), startTls: z.boolean(), ssl: z.boolean() })
export interface EmailConfig extends z.infer<typeof emailConfigSchema> { password?: string }
export function cleanEmailPassword({ password: _password, ...config }: EmailConfig): EmailConfig { return config }
export function emailConfigPayload({ hasPassword: _saved, password, ...config }: EmailConfig) { return { ...config, host: config.host.trim(), username: config.username.trim(), from: config.from.trim(), ...(config.username.trim() && password ? { password } : {}) } }
export function emailPasswordRequired(draft: EmailConfig, saved: EmailConfig | null): boolean { return !!draft.username.trim() && (!saved?.hasPassword || draft.host.trim() !== saved.host || draft.port !== saved.port || draft.username.trim() !== saved.username) }
export const capabilityNames: Record<Capability, string> = { llm: '回答模型', asr: '语音转写', embedding: '资料检索向量模型', 'web-search': '联网搜索' }
export const statusNames: Record<string, string> = { started: '进行中', complete: '已完成', failed: '失败', cancelled: '已取消', expired: '已过期' }
export function dateTime(value: string | null): string { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' }
export function cleanSecrets(config: Config): Config { return { ...config, providers: config.providers.map(({ apiKey: _key, ...provider }) => provider) } }
export function configPayload(config: Config) { return { ...config, providers: config.providers.map(({ hasApiKey: _saved, ...provider }) => ({ ...provider, apiKey: provider.apiKey?.trim() || undefined })) } }
export function passwordError(password: string): string { return password.length < 12 || new TextEncoder().encode(password).length > 72 ? '密码至少 12 个字符，且不超过 72 个 UTF-8 字节。' : '' }
