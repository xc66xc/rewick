import { z } from 'zod'
const publicUser = z.object({ id: z.string().min(1).max(128), displayName: z.string().min(1).max(254), email: z.string().max(254).nullable().optional() })
const serviceList = z.array(z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(200) })).max(100)
export const platformInfoSchema = z.object({
  advancedSettingsEnabled: z.boolean().default(false),
  desktopDefaults: z.object({ version: z.number().int().nonnegative(), llmModelId: z.string().max(200), temperature: z.number().min(0).max(2), asrServiceId: z.string().max(200), retrievalMode: z.enum(['local', 'remote']), knowledgeServiceId: z.string().max(200) }).optional(),
  user: publicUser,
  services: z.object({ asr: serviceList, knowledge: serviceList }).optional(),
  capabilities: z.object({ llm: z.boolean(), asr: z.boolean(), knowledge: z.boolean() }),
  models: z.object({ llm: z.string().max(200), asr: z.string().max(200),
    available: z.array(z.object({ id: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(200) })).max(100).optional(),
  }),
  limits: z.object({ maxAsrSessionSeconds: z.number().int().nonnegative() }),
}).superRefine((value, context) => {
  const available = value.models.available
  if (available && new Set(available.map(model => model.id)).size !== available.length) {
    context.addIssue({ code: 'custom', path: ['models', 'available'], message: '平台模型标识重复。' })
  }
  if (available && value.capabilities.llm && !available.some(model => model.id === value.models.llm)) {
    context.addIssue({ code: 'custom', path: ['models', 'llm'], message: '默认模型不在开放列表中。' })
  }
  for (const capability of ['llm', 'asr'] as const) if (value.capabilities[capability] && !value.models[capability].trim()) {
    context.addIssue({ code: 'custom', path: ['models', capability], message: '已启用的能力缺少模型名称。' })
  }
})
export const platformLoginInputSchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(1024) }).strict()
export const emailInputSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict()
export const passwordResetInputSchema = emailInputSchema.extend({ password: z.string().min(12).refine(value => Buffer.byteLength(value, 'utf8') <= 72, '密码最多 72 个 UTF-8 字节。'), code: z.string().regex(/^\d{6}$/, '请输入六位验证码。') })
export const registerInputSchema = passwordResetInputSchema.extend({ invitationCode: z.string().trim().toUpperCase().regex(/^([A-Z2-9]{6})?$/, '邀请码须为 6 位字母或数字。').optional() })
export const emailCodeResponseSchema = z.object({ retryAfterSeconds: z.number().int().min(1).max(3600), expiresInSeconds: z.number().int().min(1).max(3600) })
export const platformLoginResponseSchema = z.object({
  accessToken: z.string().min(1).max(4096).refine(value => !/\s/.test(value)),
  expiresAt: z.string().datetime({ offset: true }),
  user: publicUser,
})
export const platformSessionSchema = z.object({ expiresAt: z.string().datetime({ offset: true }), info: platformInfoSchema })
