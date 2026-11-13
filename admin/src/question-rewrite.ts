import { z } from 'zod'
import { testSchema } from './types'

const characters = (value: string) => Array.from(value).length
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum * 2)
  .refine(value => characters(value) <= maximum)
const questionSchema = z.object({
  id: z.string().regex(/^q[1-5]$/), question: boundedText(600),
  sourceTexts: z.array(boundedText(3000)).min(1).max(10),
  contextSourceTexts: z.array(boundedText(1500)).max(10).optional()
}).strict()
export const questionRewriteProbeSchema = z.object({
  resultFormat: z.literal('questions-v1'), originalQuestion: boundedText(3000),
  status: z.enum(['rewritten', 'unchanged']), questions: z.array(questionSchema).max(5),
  model: z.string().min(1).max(200)
}).strict().superRefine((value, context) => {
  const questions = value.questions
  if ((value.status === 'rewritten') !== (questions.length > 0)
    || questions.some((question, index) => question.id !== `q${index + 1}`)
    || questions.reduce((sum, question) => sum + characters(question.question), 0) > 1500
    || questions.reduce((sum, question) => sum + question.sourceTexts.reduce((total, text) => total + characters(text), 0), 0) > 3000
    || questions.reduce((sum, question) => sum + (question.contextSourceTexts ?? []).reduce((total, text) => total + characters(text), 0), 0) > 1500) {
    context.addIssue({ code: 'custom', message: '提取的问题列表不完整或超出范围。', path: ['questions'] })
  }
})
export type QuestionRewriteProbe = z.infer<typeof questionRewriteProbeSchema>
export const questionRewriteTestSchema = testSchema.extend({ questionRewrite: questionRewriteProbeSchema.nullish() })
export const questionRewriteStatusNames = { rewritten: '已提取并整理', unchanged: '沿用原话' } as const
