import { z } from 'zod'
export const platformInfoSchema = z.object({
  user: z.object({ id: z.string().min(1).max(128), username: z.string().min(1).max(200) }),
  capabilities: z.object({ llm: z.boolean(), asr: z.boolean(), knowledge: z.boolean() }),
  models: z.object({ llm: z.string().max(200), asr: z.string().max(200) }),
  limits: z.object({ dailyAnswers: z.number().int().nonnegative(), dailyKnowledgeQueries: z.number().int().nonnegative(), maxAsrSessionSeconds: z.number().int().nonnegative() }),
}).superRefine((value, context) => {
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
