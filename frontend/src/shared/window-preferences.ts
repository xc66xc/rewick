import { z } from 'zod'

export const windowPreferencesSchema = z.object({
  backgroundOpacity: z.number().int().min(0).max(80),
  fontSize: z.number().int().min(14).max(28).optional(),
  contentProtection: z.boolean()
}).strict()
export type WindowPreferences = z.infer<typeof windowPreferencesSchema>
export const defaultCompactFontSize = 19
export const defaultWindowPreferences: WindowPreferences = { backgroundOpacity: 20, contentProtection: true }
