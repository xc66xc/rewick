import { z } from 'zod'
import type { TranscriptSegment } from './types'

export const questionRewritePolicySchema = z.object({
  enabled: z.boolean(), timeoutMs: z.number().int().min(500).max(3000),
})
export type QuestionRewritePolicy = z.infer<typeof questionRewritePolicySchema>
export const defaultQuestionRewritePolicy: QuestionRewritePolicy = { enabled: false, timeoutMs: 1500 }
export const rewriteTextLength = (value: string): number => Array.from(value).length
export const questionRewriteContextSchema = z.array(z.string().trim().min(1).max(3000)).max(6)
  .refine(values => values.reduce((sum, value) => sum + rewriteTextLength(value), 0) <= 1500, '整理问题的上下文超过容量限制。')
export const questionRewriteReasonSchema = z.enum(['disabled', 'unchanged', 'ambiguous', 'input_limit', 'timeout', 'busy', 'invalid_output', 'provider_error', 'network_error', 'unavailable'])
export type QuestionRewriteReason = z.infer<typeof questionRewriteReasonSchema>
export const questionRewriteResultSchema = z.object({
  status: z.enum(['rewritten', 'unchanged', 'skipped', 'degraded']),
  question: z.string().trim().min(1).max(6000).refine(value => rewriteTextLength(value) <= 3000).nullable(),
  reason: questionRewriteReasonSchema.nullable(), model: z.string().trim().min(1).max(200).nullable(),
  durationMs: z.number().finite().min(0).max(60_000), platformVersion: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if ((value.status === 'rewritten') !== (value.question !== null)) {
    context.addIssue({ code: 'custom', message: '只有成功整理的问题可以包含整理文本。' })
  }
})
export type QuestionRewriteResult = z.infer<typeof questionRewriteResultSchema>

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
