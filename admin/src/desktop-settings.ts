import { z } from 'zod'

export const desktopSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  llmModelId: z.string(),
  temperature: z.number().min(0).max(2),
  asrServiceId: z.string(),
  retrievalMode: z.enum(['local', 'remote']),
  knowledgeServiceId: z.string(),
})
export type DesktopSettings = z.infer<typeof desktopSettingsSchema>
export const authorizedUsersSchema = z.array(z.object({ id: z.string(), displayName: z.string(), email: z.string().nullable() }))
