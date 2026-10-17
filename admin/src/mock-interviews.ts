import { z } from 'zod'

export const mockWalletSchema = z.object({ availableSeconds: z.number().int().nonnegative(), version: z.number().int().nonnegative() })
export const mockSettingsSchema = z.object({
  version: z.number().int().nonnegative(), enabled: z.boolean(), allowedUserIds: z.array(z.number().int().positive()),
  llmModelId: z.string(), reportModelId: z.string(), asrServiceId: z.string(),
  tts: z.object({ endpoint: z.string(), model: z.string(), hasApiKey: z.boolean().default(false), voiceId: z.string(), sampleRate: z.literal(24000) }),
  maxConcurrent: z.number().int(), maxFollowUps: z.number().int(), pauseMs: z.number().int(), maxTtsCharacters: z.number().int(), maxOutputTokens: z.number().int(), dailySessionLimit: z.number().int()
})
export interface MockSettings extends Omit<z.infer<typeof mockSettingsSchema>, 'tts'> { tts: z.infer<typeof mockSettingsSchema>['tts'] & { apiKey?: string } }
export const mockTestSchema = z.object({ success: z.boolean(), message: z.string(), latencyMs: z.number().optional() })
export function mockSettingsPayload(config: MockSettings) {
  const { hasApiKey: _saved, apiKey, ...tts } = config.tts
  return { ...config, tts: { ...tts, endpoint: tts.endpoint.trim(), model: tts.model.trim(), voiceId: tts.voiceId.trim(), ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}) } }
}
export function parseAllowedUsers(text: string): number[] | null {
  const ids = text.trim() ? text.trim().split(/[\s,，]+/).map(Number) : []
  return ids.length <= 1000 && ids.every(id => Number.isSafeInteger(id) && id > 0) ? [...new Set(ids)] : null
}
