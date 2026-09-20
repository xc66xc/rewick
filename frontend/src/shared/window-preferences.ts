import { z } from 'zod'

export const windowPreferencesSchema = z.object({
  backgroundOpacity: z.number().int().min(0).max(80),
  contentProtection: z.boolean()
}).strict()
export type WindowPreferences = z.infer<typeof windowPreferencesSchema>
export const defaultWindowPreferences: WindowPreferences = { backgroundOpacity: 35, contentProtection: true }
