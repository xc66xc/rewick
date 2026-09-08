import { z } from 'zod'
export const platformInfoSchema = z.object({
  user: z.object({ id: z.string().min(1).max(128), username: z.string().min(1).max(200) }),
  capabilities: z.object({ llm: z.boolean(), asr: z.boolean(), knowledge: z.boolean() }),
  models: z.object({ llm: z.string().max(200), asr: z.string().max(200),
    available: z.array(z.object({ id: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(200) })).max(100).optional(),
  }),
  limits: z.object({ dailyAnswers: z.number().int().nonnegative(), dailyKnowledgeQueries: z.number().int().nonnegative(), maxAsrSessionSeconds: z.number().int().nonnegative() }),
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
export const platformLoginInputSchema = z.object({ username: z.string().trim().min(1).max(200), password: z.string().min(1).max(1024) }).strict()
export const platformLoginResponseSchema = z.object({
  accessToken: z.string().min(1).max(4096).refine(value => !/\s/.test(value)),
  expiresAt: z.string().datetime({ offset: true }),
  user: z.object({ id: z.string().min(1).max(128), username: z.string().min(1).max(200) }),
})
export const platformSessionSchema = z.object({ expiresAt: z.string().datetime({ offset: true }), info: platformInfoSchema })
