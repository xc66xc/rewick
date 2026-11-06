import { z } from 'zod'

export const defaultSessionRecordMaxMiB = 20
export const sessionRecordMaxMiBSchema = z.number().int().min(1).max(50)
// A lowered save policy must not make previously saved records unreadable.
// Includes room for the detail response and save request envelopes.
export const maxSessionRecordTransferBytes = 51 * 1048576
