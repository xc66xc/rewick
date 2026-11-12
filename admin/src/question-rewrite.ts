import { z } from 'zod'
import { testSchema } from './types'

export const questionRewriteProbeSchema = z.object({
  originalQuestion: z.string().min(1).max(3000),
  status: z.enum(['rewritten', 'unchanged']),
  question: z.string().max(3000).nullish(),
  model: z.string().min(1).max(200)
}).refine(value => value.status !== 'rewritten' || !!value.question?.trim(), { message: '缺少改写问题。', path: ['question'] })
export type QuestionRewriteProbe = z.infer<typeof questionRewriteProbeSchema>
export const questionRewriteTestSchema = testSchema.extend({ questionRewrite: questionRewriteProbeSchema.nullish() })
export const questionRewriteStatusNames = { rewritten: '已整理', unchanged: '沿用原话' } as const
