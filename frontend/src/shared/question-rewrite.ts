import { z } from 'zod'
import type { TranscriptSegment } from './types'

export const questionRewritePolicySchema = z.object({
  enabled: z.boolean(), timeoutMs: z.number().int().min(500).max(3000),
  resultFormats: z.array(z.enum(['single', 'questions-v1'])).max(2).optional(),
  batchReferencesAvailable: z.boolean().optional(),
})
export type QuestionRewritePolicy = z.infer<typeof questionRewritePolicySchema>
export const defaultQuestionRewritePolicy: QuestionRewritePolicy = { enabled: false, timeoutMs: 1500 }
export const rewriteTextLength = (value: string): number => Array.from(value).length
export const questionRewriteContextSchema = z.array(z.string().trim().min(1).max(3000)).max(6)
  .refine(values => values.reduce((sum, value) => sum + rewriteTextLength(value), 0) <= 1500, '整理问题的上下文超过容量限制。')
export const questionRewriteReasonSchema = z.enum(['disabled', 'unchanged', 'ambiguous', 'input_limit', 'timeout', 'busy', 'invalid_output', 'provider_error', 'network_error', 'unavailable'])
export type QuestionRewriteReason = z.infer<typeof questionRewriteReasonSchema>
const rewriteMetadata = {
  status: z.enum(['rewritten', 'unchanged', 'skipped', 'degraded']),
  reason: questionRewriteReasonSchema.nullable(), model: z.string().trim().min(1).max(200).nullable(),
  durationMs: z.number().finite().min(0).max(60_000), platformVersion: z.number().int().nonnegative(),
}
export const singleQuestionRewriteResultSchema = z.object({
  ...rewriteMetadata, question: z.string().trim().min(1).max(6000).refine(value => rewriteTextLength(value) <= 3000).nullable(),
}).strict().superRefine((value, context) => {
  if ((value.status === 'rewritten') !== (value.question !== null)) {
    context.addIssue({ code: 'custom', message: '只有成功整理的问题可以包含整理文本。' })
  }
})
export const questionIdSchema = z.enum(['q1', 'q2', 'q3', 'q4', 'q5'])
const sources = z.array(z.string().trim().min(1).max(6000)).max(10)
export const extractedQuestionSchema = z.object({
  id: questionIdSchema,
  question: z.string().trim().min(1).max(1200).refine(value => rewriteTextLength(value) <= 600),
  sourceTexts: sources.min(1), contextSourceTexts: sources.optional(),
}).strict()
export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>
export const questionExtractionResultSchema = z.object({
  ...rewriteMetadata, resultFormat: z.literal('questions-v1'), questions: z.array(extractedQuestionSchema).max(5),
}).strict().superRefine((value, context) => {
  const questions = value.questions
  if ((value.status === 'rewritten') !== (questions.length > 0)
    || questions.some((question, index) => question.id !== `q${index + 1}`)
    || questions.reduce((sum, question) => sum + rewriteTextLength(question.question), 0) > 1500
    || questions.flatMap(question => question.sourceTexts).reduce((sum, text) => sum + rewriteTextLength(text), 0) > 3000
    || questions.flatMap(question => question.contextSourceTexts ?? []).reduce((sum, text) => sum + rewriteTextLength(text), 0) > 1500) {
    context.addIssue({ code: 'custom', message: '提取的问题数量、来源或容量无效。' })
  }
})
export const questionRewriteResultSchema = z.union([singleQuestionRewriteResultSchema, questionExtractionResultSchema])
export type QuestionExtractionResult = z.infer<typeof questionExtractionResultSchema>
export type QuestionRewriteResult = z.infer<typeof questionRewriteResultSchema>
export function isQuestionExtraction(result: QuestionRewriteResult | undefined): result is QuestionExtractionResult {
  return result !== undefined && 'resultFormat' in result && result.resultFormat === 'questions-v1'
}

/** Freeze only previous final ASR segments; never pass partial subtitles or historical AI answers. */
export function questionRewriteContext(segments: TranscriptSegment[], question: string, excludedIds: readonly string[] = []): string[] {
  const excluded = new Set(excludedIds)
  const currentQuestion = question.trim().replace(/\s+/g, '')
  const result: string[] = []
  let remaining = 1500
  const firstExcluded = segments.findIndex(segment => excluded.has(segment.id))
  for (let index = (firstExcluded < 0 ? segments.length : firstExcluded) - 1; index >= 0 && result.length < 6 && remaining > 0; index--) {
    const segment = segments[index]
    const text = segment.text.trim()
    const normalized = text.replace(/\s+/g, '')
    if (!segment.isFinal || !text || excluded.has(segment.id)
      || currentQuestion && (currentQuestion.includes(normalized) || normalized.includes(currentQuestion))) continue
    const characters = Array.from(text)
    const bounded = characters.slice(-remaining).join('')
    result.unshift(bounded)
    remaining -= Math.min(characters.length, remaining)
  }
  return result
}
