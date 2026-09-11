import { z } from 'zod'
import { pageSchema } from './types'

export const walletSchema = z.object({
  availableSeconds: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  serverTime: z.string(),
  session: z.object({ id: z.string(), status: z.enum(['active', 'ended']), startedAt: z.string(), expiresAt: z.string(), endedAt: z.string().nullable(), usedSeconds: z.number().int().nonnegative(), endReason: z.string().nullable() }).nullable()
})
export const transactionsSchema = pageSchema(z.object({
  id: z.string(), deltaSeconds: z.number().int(), beforeSeconds: z.number().int(), afterSeconds: z.number().int(),
  reason: z.string(), actorDisplayName: z.string().nullable(), sessionId: z.string().nullable(), createdAt: z.string()
}))
export type Wallet = z.infer<typeof walletSchema>
export type Adjustment = 'add' | 'subtract' | 'set'
