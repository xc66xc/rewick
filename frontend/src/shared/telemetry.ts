import { z } from 'zod'

export const operationStages = ['answer.complete', 'answer.auto_wait', 'answer.prepare', 'retrieval.rag', 'retrieval.web', 'retrieval.join', 'retrieval.embedding', 'retrieval.database', 'llm.first_content', 'llm.complete', 'answer.first_render', 'session.save', 'session.sync', 'asr.connect', 'asr.first_transcript', 'asr.complete', 'asr.backlog', 'auto.feedback'] as const
export const telemetryEventSchema = z.object({
  eventId: z.string().uuid(), operationId: z.string().uuid(), spanId: z.string().uuid(), parentSpanId: z.string().uuid().optional(),
  requestId: z.string().max(128).optional(), sessionId: z.string().max(128).optional(), stage: z.enum(operationStages), source: z.literal('desktop'),
  startedAt: z.string().datetime({ offset: true }), offsetMs: z.number().finite().nonnegative().max(86400000).optional(), durationMs: z.number().finite().nonnegative().max(86400000),
  outcome: z.enum(['success', 'error', 'timeout', 'cancelled', 'rejected', 'degraded', 'empty', 'skipped']),
  reason: z.enum(['provider_error', 'network_error', 'timeout', 'cancelled', 'unauthorized', 'unavailable', 'rate_limit', 'session_inactive', 'invalid_input', 'storage_error', 'queue_full', 'empty', 'feedback', 'server_only', 'unknown']).optional(),
  serviceSource: z.enum(['platform', 'custom']).optional(), providerType: z.enum(['llm', 'pg', 'bailian', 'tavily', 'asr', 'system']),
  model: z.string().max(200).optional(), appVersion: z.string().max(32).optional(),
  metadata: z.object({ fragmentCount: z.number().finite().nonnegative().max(1e12).optional(), inputTokens: z.number().finite().nonnegative().max(1e12).optional(), outputTokens: z.number().finite().nonnegative().max(1e12).optional(), totalTokens: z.number().finite().nonnegative().max(1e12).optional(), maxGapMs: z.number().finite().nonnegative().max(1e12).optional(), summaryEnabled: z.boolean().optional(), bufferedBytes: z.number().finite().nonnegative().max(1e12).optional(), audioBytes: z.number().finite().nonnegative().max(1e12).optional(), filteredCount: z.number().finite().nonnegative().max(1e12).optional(), triggerCount: z.number().finite().nonnegative().max(1e12).optional() }).strict().optional(),
}).strict()
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>
export type TelemetryStage = TelemetryEvent['stage']
export type TelemetryMetadata = NonNullable<TelemetryEvent['metadata']>
