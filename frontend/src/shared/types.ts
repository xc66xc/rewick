import type { JobExperienceLevel } from './job-experience-level'
import type { EnvironmentStamp, EnvironmentStampInput } from './environment-stamp'
export interface SessionExportOptions { includeAiAnswers: boolean; includeTranscript: boolean; includeInterviewInfo: boolean }
import type { InterviewType } from './interview-type'
import type { PackageCatalog, PaymentOrder, CreatePaymentOrder } from './payment'
export type ServiceKind = 'llm' | 'asr' | 'knowledge'
export interface ServiceSelection { source: 'platform' | 'custom'; id: string }
export interface CustomServiceInput {
  id?: string; name: string; kind: ServiceKind; url: string
  model?: string; agentId?: string; apiKey?: string
}
export interface CustomServiceProfile extends Omit<CustomServiceInput, 'id' | 'apiKey'> { id: string; hasApiKey: boolean }
export interface PlatformServices { asr: { id: string; name: string }[]; knowledge: { id: string; name: string }[] }
export interface DesktopDefaults { version: number; llmModelId: string; temperature: number; asrServiceId: string; retrievalMode: 'local' | 'remote'; knowledgeServiceId: string }
export interface PlatformInfo {
  advancedSettingsEnabled?: boolean
  webSearchAvailable?: boolean
  webSearchTimeoutMs?: number
  desktopDefaults?: DesktopDefaults
  user: { id: string; displayName: string; email?: string | null }
  capabilities: { llm: boolean; asr: boolean; knowledge: boolean }
  models: { llm: string; asr: string; available?: { id: string; name: string }[] }
  services?: PlatformServices
  limits: { maxAsrSessionSeconds: number }
}
export interface PlatformSettings {
  advancedSettingsEnabled?: boolean
  webSearchAvailable?: boolean
  webSearchTimeoutMs?: number
  desktopDefaults?: DesktopDefaults
  enabled: boolean
  baseUrl: string
  selectedModelId?: string
  authenticated: boolean
  user?: PlatformInfo['user']
  expiresAt?: string
  capabilities: PlatformInfo['capabilities']
  models: PlatformInfo['models']
  services?: PlatformServices
  limits?: PlatformInfo['limits']
}
export interface Settings {
  sessionNotice?: string
  preferencesVersion?: number
  unavailablePlatformSelections?: Partial<Record<ServiceKind, string | null>>
  accountScope?: string
  customServices?: CustomServiceProfile[]
  serviceSelections?: Partial<Record<ServiceKind, ServiceSelection>>
  platform?: PlatformSettings
  asr: { url: string; model: string; hasApiKey: boolean; silenceMs: number }
  llm: { baseUrl: string; model: string; hasApiKey: boolean; temperature: number }
  context: { name: string; text: string }
  interviewTarget: InterviewTarget
  interviewEnvironment?: InterviewEnvironmentSnapshot
  retrieval: { enabled: boolean }
  webSearch?: { enabled: boolean }
  remoteKnowledge: { enabled: boolean; url: string; agentId: string; hasApiKey: boolean; serviceId?: string }
  answerStyle: 'concise' | 'detailed'
  autoAnswer: { enabled: boolean; pauseMs: number }
}
export interface SettingsInput {
  preferencesVersion?: number
  serviceSelections?: Settings['serviceSelections']
  platform?: Pick<PlatformSettings, 'enabled' | 'baseUrl' | 'selectedModelId'>
  asr: Omit<Settings['asr'], 'hasApiKey'> & { apiKey?: string }
  llm: Omit<Settings['llm'], 'hasApiKey'> & { apiKey?: string }
  context: Settings['context']
  interviewTarget: InterviewTarget
  retrieval: Settings['retrieval']
  webSearch?: Settings['webSearch']
  remoteKnowledge: Omit<Settings['remoteKnowledge'], 'hasApiKey'> & { apiKey?: string }
  answerStyle: Settings['answerStyle']
  autoAnswer: Settings['autoAnswer']
}
export interface InterviewTarget { companyName: string; roleName: string; jobDescription: string }
export interface ResumeProfile { hasContent?: boolean; version?: number; bodyLoaded?: boolean; id: string; name: string; text: string; createdAt: string; updatedAt: string }
export interface TargetProfile extends InterviewTarget { version?: number; bodyLoaded?: boolean; id: string; name: string; createdAt: string; updatedAt: string }
export interface InterviewEnvironment {
  jobExperienceLevel?: JobExperienceLevel | null
  stamp?: EnvironmentStamp | null
  hotwords?: string[]
  interviewType: InterviewType
  version?: number; bodyLoaded?: boolean
  id: string; name: string; resumeId: string | null; targetId: string | null; referenceIds: string[]; createdAt: string; updatedAt: string
}
export interface InterviewLibrary {
  resumes: ResumeProfile[]; targets: TargetProfile[]; environments: InterviewEnvironment[]; activeEnvironmentId: string
}
export interface InterviewEnvironmentSnapshot {
  jobExperienceLevel?: JobExperienceLevel | null
  /** Historical records created before interview types have no type. */
  interviewType?: InterviewType
  id: string; name: string; resumeId: string | null; resumeName: string; targetId: string | null; targetName: string; referenceIds: string[]
}
export interface ResumeInput { version?: number; bodyLoaded?: boolean; id?: string; name: string; text: string }
export interface TargetInput extends InterviewTarget { version?: number; bodyLoaded?: boolean; id?: string; name: string }
export interface EnvironmentInput { jobExperienceLevel?: JobExperienceLevel | null; hotwords?: string[]; interviewType: InterviewType; version?: number; bodyLoaded?: boolean; id?: string; name: string; resumeId: string | null; targetId: string | null; referenceIds: string[] }
export type ReferenceKind = 'technical' | 'personal'
export interface ReferenceDocument {
  id: string
  name: string
  kind: ReferenceKind
  enabled: boolean
  status: 'parsing' | 'pending' | 'indexing' | 'ready' | 'error'
  pageCount: number
  contentHash: string
  revision: number
  createdAt: string
  updatedAt: string
  error?: string
  chunkCount: number
}
export interface ReferenceExcerpt {
  source?: 'platform' | 'bailian' | 'web'
  generatedSummary?: boolean
  url?: string
  title?: string
  score?: number
  documentId: string
  revision: number
  name: string
  kind: ReferenceKind
  chunkId: string
  text: string
  pageStart?: number
  pageEnd?: number
}
export interface RetrievalContext {
  status: 'disabled' | 'ready' | 'degraded' | 'empty'
  message?: string
  excerpts: ReferenceExcerpt[]
  remote?: { agentId: string; status: 'ready' | 'degraded' | 'empty'; message?: string }
  web?: { status: 'ready' | 'degraded' | 'empty'; message?: string }
}
export interface TranscriptSegment {
  id: string
  text: string
  startMs: number
  endMs?: number
  isFinal: boolean
  isEdited?: boolean
}
export interface ModelInputSnapshot {
  model: string
  messages: { role: 'system' | 'user'; content: string }[]
}
export interface Answer {
  id: string
  question: string
  text: string
  createdAt: string
  status: 'streaming' | 'complete' | 'cancelled' | 'error'
  error?: string
  interviewTarget?: InterviewTarget
  retrieval?: RetrievalContext
  modelInput?: ModelInputSnapshot
  interviewEnvironment?: InterviewEnvironmentSnapshot
}
export interface SessionRecord {
  id: string
  createdAt: string
  title: string
  interviewSessionId?: string
  usedSeconds?: number
  segmentCount?: number
  answerCount?: number
  segments: TranscriptSegment[]
  answers: Answer[]
  interviewEnvironment?: InterviewEnvironmentSnapshot
}
export interface AnswerRequest { requestId: string; question: string; transcript: string; environmentId?: string; operationId?: string; autoWaitMs?: number }
export type AsrStatus = 'connecting' | 'listening' | 'stopping' | 'idle' | 'error'
export interface WalletState {
  background?: Pick<Settings, 'context' | 'interviewTarget' | 'interviewEnvironment'> | null
  availableSeconds: number
  version: number
  serverTime: string
  session: { id: string; status: 'active' | 'ended'; startedAt: string; expiresAt: string; endedAt: string | null; usedSeconds: number; endReason: string | null } | null
}
export type AppEvent =
  | ({ kind: 'recording-progress' } & import('./recording-types').RecordingProgress)
  | { kind: 'window-mode'; compact: boolean }
  | { kind: 'session-stopping'; nonce: string }
  | { kind: 'session-ended'; message: string }
  | { kind: 'session-paused'; message: string }
  | { kind: 'session-restored' }
  | { kind: 'wallet-changed'; wallet: WalletState }
  | { kind: 'asr-status'; sessionId: string; status: AsrStatus; message?: string }
  | { kind: 'transcript'; sessionId: string; segment: TranscriptSegment }
  | { kind: 'documents-changed' }
  | { kind: 'documents-error'; message: string }
  | { kind: 'interviews-changed' }
  | { kind: 'settings-changed' }
  | { kind: 'answer-context'; requestId: string; interviewTarget: InterviewTarget; retrieval: RetrievalContext; interviewEnvironment?: InterviewEnvironmentSnapshot }
  | { kind: 'answer-request'; requestId: string; modelInput: ModelInputSnapshot }
  | { kind: 'answer-delta'; requestId: string; delta: string }
  | { kind: 'answer-done'; requestId: string; cancelled: boolean }
  | { kind: 'answer-error'; requestId: string; message: string }
  | { kind: 'shortcut'; action: 'answer' }
export interface DesktopBridge {
  openWebSource?(url: string): Promise<void>
  recordings?: {
    start(sessionId: string): Promise<void>
    append(sessionId: string, audio: ArrayBuffer): Promise<void>
    stop(sessionId: string): Promise<import('./recording-types').RecordingInfo>
    info(sessionId: string): Promise<import('./recording-types').RecordingInfo | null>
    remove(sessionId: string): Promise<void>
    exportReview(sessionId: string): Promise<{ path: string } | null>
    download(sessionId: string): Promise<{ path: string } | null>
    cancelExport(sessionId: string): Promise<void>
  }
  invitationSettings(): Promise<import('./invitation').InvitationSettings>
  invitationMine(): Promise<import('./invitation').InvitationSummary>
  invitationCreateCode(): Promise<import('./invitation').InvitationSummary>
  stageSessionForLogout(nonce: string, record: SessionRecord | null): Promise<void>
  withAccountScope?(scope: string): DesktopBridge
  getPackageCatalog(): Promise<PackageCatalog>
  getPaymentOrders(): Promise<PaymentOrder[]>
  createPaymentOrder(input: CreatePaymentOrder): Promise<PaymentOrder>
  refreshPaymentOrder(id: string): Promise<PaymentOrder>
  openPaymentCheckout(id: string): Promise<void>
  cancelPaymentOrder(id: string): Promise<PaymentOrder>
  getWallet(): Promise<WalletState>
  startInterview(requestId: string, environmentId: string): Promise<WalletState>
  endInterview(): Promise<WalletState | null>
  getCaptureError(): Promise<string | null>
  getSettings(): Promise<Settings>
  getRememberedLogin(): Promise<{ identifier: string; password: string } | null>
  platformLogin(input: { identifier: string; password: string; rememberMe?: boolean }): Promise<Settings>
  platformRegister(input: { email: string; password: string; code: string; invitationCode?: string }): Promise<Settings>
  requestEmailCode(input: { email: string }): Promise<{ retryAfterSeconds: number; expiresInSeconds: number }>
  requestPasswordResetCode(input: { email: string }): Promise<{ retryAfterSeconds: number; expiresInSeconds: number }>
  resetPassword(input: { email: string; password: string; code: string }): Promise<void>
  saveCustomService(input: CustomServiceInput): Promise<Settings>
  testCustomService(input: CustomServiceInput): Promise<{ latencyMs: number; message: string }>
  removeCustomService(id: string): Promise<Settings>
  platformLogout(): Promise<Settings>
  refreshPlatform(): Promise<Settings>
  saveSettings(input: SettingsInput): Promise<Settings>
  testModel(): Promise<{ latencyMs: number; message: string }>
  importContext(): Promise<{ name: string; text: string } | null>
  importTarget(): Promise<{ name: string; text: string } | null>
  getResume?(id: string): Promise<ResumeInput>
  getTarget?(id: string): Promise<TargetInput>
  getInterviewLibrary(): Promise<InterviewLibrary>
  saveResume(input: ResumeInput): Promise<InterviewLibrary>
  removeResume(id: string): Promise<InterviewLibrary>
  saveTarget(input: TargetInput): Promise<InterviewLibrary>
  removeTarget(id: string): Promise<InterviewLibrary>
  extractEnvironmentHotwords(input: EnvironmentInput): Promise<string[]>
  saveEnvironment(input: EnvironmentInput): Promise<InterviewLibrary>
  saveEnvironmentStamp(input: EnvironmentStampInput): Promise<InterviewLibrary>
  removeEnvironment(id: string): Promise<InterviewLibrary>
  activateEnvironment(id: string): Promise<Settings>
  testRemoteKnowledge(): Promise<{ latencyMs: number; message: string }>
  listReferences(): Promise<ReferenceDocument[]>
  importReferences(): Promise<ReferenceDocument[]>
  previewReference(id: string): Promise<{ document: ReferenceDocument; text: string }>
  updateReference(id: string, patch: { enabled?: boolean; kind?: ReferenceKind }): Promise<void>
  removeReference(id: string): Promise<void>
  reindexReference(id: string): Promise<void>
  startAsr(): Promise<{ sessionId: string }>
  sendAudio(sessionId: string, audio: ArrayBuffer): void
  stopAsr(): Promise<void>
  telemetryEnabled?(): Promise<boolean>
  reportTelemetry?(event: import('./telemetry').TelemetryEvent): void
  generateAnswer(request: AnswerRequest): Promise<void>
  cancelAnswer(): Promise<void>
  setAlwaysOnTop(value: boolean): Promise<boolean>
  setCompact(value: boolean): Promise<void>
  /** 弹窗遮罩显示期间把 Windows 原生标题条(WCO)着色为遮罩同色;其余平台空操作 */
  setWindowScrim?(visible: boolean): Promise<void>
  getWindowPreferences(): Promise<import('./window-preferences').WindowPreferences>
  saveWindowPreferences(value: import('./window-preferences').WindowPreferences): Promise<import('./window-preferences').WindowPreferences>
  getHistoryPage(cursor?: number): Promise<{ records: SessionRecord[]; nextCursor: number | null }>
  getHistoryDetail(id: string): Promise<SessionRecord>
  getHistorySyncStatus(): Promise<string>
  getHistory(): Promise<SessionRecord[]>
  saveSession(record: SessionRecord, accountScope?: string): Promise<void>
  removeSession(id: string): Promise<void>
  exportSession(record: SessionRecord, options: SessionExportOptions): Promise<boolean>
  exportAnswersExcel?(id: string): Promise<boolean>
  onEvent(callback: (event: AppEvent) => void): () => void
}
declare global { interface Window { copilot?: DesktopBridge } }
