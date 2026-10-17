import { z } from 'zod'

export const mockStateSchema = z.enum(['ready', 'starting', 'speaking', 'listening', 'deciding', 'paused', 'completed', 'error'])
export const mockSessionSchema = z.object({
  id: z.string().uuid(), state: mockStateSchema, version: z.number().int().nonnegative(), generation: z.number().int().nonnegative(),
  environmentName: z.string(), interviewType: z.enum(['technical', 'general', 'hr']), durationMinutes: z.number(),
  usedSeconds: z.number(), remainingSeconds: z.number(), pauseMs: z.number().int().min(200).max(10000).optional(), avatarId: z.string(), voiceId: z.string(),
  turns: z.array(z.object({ id: z.string().uuid(), number: z.number(), question: z.string(), answerText: z.string(), status: z.enum(['pending', 'answered', 'skipped']), assessment: z.unknown().optional() })),
  currentTurnId: z.string().uuid().nullish(), reportStatus: z.string(), error: z.string().nullish(), createdAt: z.string()
})
export const mockCapabilitiesSchema = z.object({ enabled: z.boolean(), voices: z.array(z.object({ id: z.string(), name: z.string() })), avatars: z.array(z.object({ id: z.string(), name: z.string() })), durations: z.array(z.number()) })
export const mockWalletSchema = z.object({ availableSeconds: z.number(), version: z.number() })
export const mockReportSchema = z.object({ status: z.enum(['pending', 'running', 'ready', 'failed']), report: z.unknown().optional(), error: z.string().nullish() })
export const mockCreateSchema = z.object({ requestId: z.string().uuid(), environmentId: z.string().uuid(), durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45)]), difficulty: z.enum(['standard', 'deep']), avatarId: z.literal('rewick-interviewer'), voiceId: z.string().min(1).max(100) }).strict()
export const mockCommandSchema = z.object({ requestId: z.string().uuid(), expectedVersion: z.number().int().nonnegative(), command: z.enum(['start', 'submit_answer', 'repeat', 'interrupt', 'skip', 'pause', 'resume', 'finish', 'playback_completed', 'heartbeat']), turnId: z.string().uuid().optional(), text: z.string().max(20000).optional() }).strict()
export const mockEventSchema = z.object({ protocolVersion: z.literal(1), sessionId: z.string().uuid(), kind: z.enum(['state', 'transcript.partial', 'transcript.final', 'speech.start', 'speech.end', 'error']), generation: z.number().int().nonnegative(), sequence: z.number().int().nonnegative(), payload: z.unknown() })
export type MockSession = z.infer<typeof mockSessionSchema>
export type MockCapabilities = z.infer<typeof mockCapabilitiesSchema>
export type MockReport = z.infer<typeof mockReportSchema>
export type MockCommand = z.infer<typeof mockCommandSchema>
export type MockCreate = z.infer<typeof mockCreateSchema>
export type MockEvent = z.infer<typeof mockEventSchema>
export type MockMessage = { kind: 'event'; event: MockEvent } | { kind: 'audio'; frame: ArrayBuffer } | { kind: 'disconnected'; message: string }
export interface MockBridge {
  capabilities(): Promise<MockCapabilities>
  wallet(): Promise<z.infer<typeof mockWalletSchema>>
  ledger(): Promise<{ items: { id: string; deltaSeconds: number; balanceAfterSeconds: number; reason: string; createdAt: string }[] }>
  list(): Promise<{ items: MockSession[] }>
  create(input: MockCreate): Promise<MockSession>
  get(id: string): Promise<MockSession>
  command(id: string, input: MockCommand): Promise<MockSession>
  report(id: string): Promise<MockReport>
  retryReport(id: string, requestId: string): Promise<MockReport>
  exportQa(id: string): Promise<boolean>
  remove(id: string): Promise<{ deleted: boolean }>
  connect(id: string): Promise<void>
  disconnect(): Promise<void>
  sendAudio(frame: ArrayBuffer): void
  credit(bytes: number, speechId: string, generation: number): void
  onEvent(callback: (message: MockMessage) => void): () => void
}
export const MOCK_AUDIO_HEADER = 28
export function encodeMockAudio(direction: 0 | 1, generation: number, id: string, sequence: number, pcm: ArrayBuffer): ArrayBuffer {
  if (!z.string().uuid().safeParse(id).success || pcm.byteLength > 65536 || pcm.byteLength % 2) throw new Error('模拟音频帧无效。')
  const buffer = new ArrayBuffer(MOCK_AUDIO_HEADER + pcm.byteLength)
  const view = new DataView(buffer); const bytes = new Uint8Array(buffer)
  bytes.set([77, 73, 1, direction]); view.setUint32(4, generation, true)
  bytes.set(id.replaceAll('-', '').match(/.{2}/g)?.map(value => parseInt(value, 16)) ?? [], 8)
  view.setUint32(24, sequence, true); bytes.set(new Uint8Array(pcm), MOCK_AUDIO_HEADER)
  return buffer
}
export function decodeMockAudio(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer)
  if (bytes.length <= MOCK_AUDIO_HEADER || bytes.length > 65536 + MOCK_AUDIO_HEADER || (bytes.length - MOCK_AUDIO_HEADER) % 2 || bytes[0] !== 77 || bytes[1] !== 73 || bytes[2] !== 1 || bytes[3] > 1) throw new Error('模拟音频帧无效。')
  const hex = [...bytes.slice(8, 24)].map(value => value.toString(16).padStart(2, '0')).join('')
  return { direction: bytes[3], generation: view.getUint32(4, true), id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, sequence: view.getUint32(24, true), pcm: buffer.slice(MOCK_AUDIO_HEADER) }
}
