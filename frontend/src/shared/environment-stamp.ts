import { z } from 'zod'

export const environmentStampColors = ['blue', 'amber', 'green', 'red'] as const
export type EnvironmentStampColor = typeof environmentStampColors[number]
export interface EnvironmentStamp { text: string; color: EnvironmentStampColor }
export interface EnvironmentStampInput { id: string; version: number; stamp: EnvironmentStamp | null }

export function environmentStampTextError(value: string): string | undefined {
  const text = value.trim()
  if (/[\p{Cc}\p{Zl}\p{Zp}\uD800-\uDFFF]/u.test(value)) return '印章文字不能包含换行、控制符或无效字符。'
  const length = Array.from(text).length
  if (length < 1 || length > 8) return '请输入 1–8 个字符，空格也计入长度。'
}
export const environmentStampSchema = z.object({
  text: z.string().superRefine((text, context) => {
    const error = environmentStampTextError(text)
    if (error) context.addIssue({ code: 'custom', message: error })
  }).transform(text => text.trim()),
  color: z.enum(environmentStampColors),
}).strict()
export const environmentStampInputSchema = z.object({
  id: z.string().min(1).max(128), version: z.number().int().positive(), stamp: environmentStampSchema.nullable(),
}).strict()
