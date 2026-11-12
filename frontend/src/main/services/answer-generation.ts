import { randomUUID } from 'node:crypto'
import type { AppEvent, RetrievalContext, Settings } from '../../shared/types'
import type { ServiceSecrets } from './settings-store'
import type { OperationContext, OperationsTelemetry } from './operations-telemetry'
import type { PlatformWork } from './platform-work'
import type { ReferenceService } from './reference-service'
import { answerRequestSchema, parseInput } from './validation'
import { needsPlatform } from './service-routing'
import { QuestionRewriteClient, questionRewriteEnabled } from './question-rewrite-client'
import { retrieveAnswerContext } from './answer-retrieval'
import { WebSearchClient } from './web-search-client'
import { LlmClient } from './llm-client'

type Snapshot = { settings: Settings; secrets: ServiceSecrets }
type AnswerConnection = { settings: Settings; apiKey: string; platform?: true }
export interface AnswerWork {
  epoch: number
  pendingId: string | null
  activeId: string | null
  controller: AbortController | null
  llm: LlmClient | null
  releasePlatform?: () => void
}
export interface AnswerGenerationDependencies {
  assertActive: () => void
  isChangingEnvironment: () => boolean
  sessionId: () => string | undefined
  background: () => Pick<Settings, 'context' | 'interviewTarget' | 'interviewEnvironment'> | null | undefined
  getSnapshot: () => Promise<Snapshot>
  resolve: (settings: Settings) => Promise<Settings>
  connect: (snapshot: Snapshot, signal: AbortSignal) => Promise<AnswerConnection>
  platformWork: PlatformWork
  references: Pick<ReferenceService, 'retrieve'>
  telemetry: OperationsTelemetry
  emit: (event: AppEvent) => void
}

export function cancelAnswerGeneration(work: AnswerWork, emit: (event: AppEvent) => void): void {
  work.releasePlatform?.(); work.releasePlatform = undefined
  work.epoch++
  work.controller?.abort()
  work.controller = null
  work.llm?.cancel()
  work.activeId = null
  if (work.pendingId) emit({ kind: 'answer-done', requestId: work.pendingId, cancelled: true })
  work.pendingId = null
}

export function finishAnswerGeneration(work: AnswerWork, event: AppEvent): void {
  if ((event.kind === 'answer-done' || event.kind === 'answer-error') && event.requestId === work.activeId) {
    work.activeId = null
    work.releasePlatform?.(); work.releasePlatform = undefined
  }
}

/** Production answer:generate entry. One owner coordinates rewrite, parallel retrieval and the final SSE request. */
export async function generateAnswer(input: unknown, work: AnswerWork, dependencies: AnswerGenerationDependencies): Promise<void> {
  const { telemetry, emit } = dependencies
  dependencies.assertActive()
  if (dependencies.isChangingEnvironment()) throw new Error('正在保存面试环境，请稍后生成回答。')
  const request = parseInput(answerRequestSchema, input)
  const observation = telemetry.operation({ operationId: request.operationId ?? randomUUID(), requestId: request.requestId, sessionId: dependencies.sessionId() })
  const preparing = performance.now()
  if (observation && request.autoWaitMs !== undefined) telemetry.record(observation, 'answer.auto_wait', observation.started - request.autoWaitMs, 'success', { triggerCount: 1 })
  cancelAnswerGeneration(work, emit)
  const epoch = work.epoch
  const platformRevision = dependencies.platformWork.revision
  work.pendingId = request.requestId
  const controller = new AbortController()
  work.controller = controller
  const current = () => epoch === work.epoch && !controller.signal.aborted
  let preparationFinished = false
  const observedCancel = () => { if (!preparationFinished) telemetry.record(observation, 'answer.complete', observation?.started ?? preparing, 'cancelled', undefined, observation?.spanId) }
  controller.signal.addEventListener('abort', observedCancel, { once: true })
  try {
    const snapshot = await dependencies.getSnapshot()
    const background = dependencies.background()
    const config = background ? { ...snapshot.settings, ...background } : await dependencies.resolve(snapshot.settings)
    if (request.environmentId && request.environmentId !== config.interviewEnvironment?.id) throw new Error('面试环境已切换，请重新生成回答。')
    const secrets = snapshot.secrets
    if (!current()) return
    if (needsPlatform(config, secrets, 'llm') || config.webSearch?.enabled || questionRewriteEnabled(config, request)) {
      work.releasePlatform = dependencies.platformWork.track(platformRevision, () => { if (epoch === work.epoch) cancelAnswerGeneration(work, emit) })
    }
    const connection = await dependencies.connect({ settings: config, secrets }, controller.signal)
    if (!current()) return
    const resolved = connection.settings
    describeAnswerModel(observation, connection)
    telemetry.record(observation, 'answer.prepare', preparing, 'success')
    let questionRewrite
    if (questionRewriteEnabled(resolved, request)) {
      emit({ kind: 'answer-preparing', requestId: request.requestId, stage: 'question-rewrite' })
      questionRewrite = await telemetry.measure(observation, 'question.rewrite', () => new QuestionRewriteClient(resolved, secrets.platformAccessToken).rewrite(request, controller.signal), 'system', 'platform', controller.signal)
      if (!current()) return
      emit({ kind: 'answer-preparing', requestId: request.requestId, stage: 'retrieval', questionRewrite })
    }
    const effectiveQuestion = questionRewrite?.status === 'rewritten' ? questionRewrite.question ?? request.question : request.question
    const retrieval: RetrievalContext = request.mode === 'algorithm' ? { status: 'disabled', excerpts: [] } : await telemetry.measure(observation, 'retrieval.join', () => retrieveAnswerContext(
      signal => telemetry.measure(observation, 'retrieval.rag', () => dependencies.references.retrieve(effectiveQuestion, request.transcript, resolved, signal), 'pg', 'platform'),
      resolved.webSearch?.enabled ? signal => telemetry.measure(observation, 'retrieval.web', () => new WebSearchClient(resolved, secrets.platformAccessToken).retrieve(effectiveQuestion, signal), 'system', 'platform') : undefined,
      controller.signal), 'system')
    if (!current()) return
    emit({ kind: 'answer-context', requestId: request.requestId, interviewTarget: config.interviewTarget, retrieval, interviewEnvironment: config.interviewEnvironment, ...(questionRewrite ? { questionRewrite } : {}) })
    dependencies.assertActive()
    work.pendingId = null
    work.activeId = request.requestId
    preparationFinished = true
    work.llm = new LlmClient(connection.settings, connection.apiKey, emit, connection.platform, telemetry, observation && { ...observation, parentSpanId: observation.spanId, spanId: randomUUID() })
    // LlmClient emits its own request-scoped error; avoid sending another error for the same answer.
    void work.llm.generate(request, retrieval, questionRewrite).catch(() => undefined)
  } catch (error) {
    if (!current()) return
    telemetry.record(observation, 'answer.complete', observation?.started ?? preparing, 'error', undefined, observation?.spanId)
    work.pendingId = null
    work.releasePlatform?.(); work.releasePlatform = undefined
    throw error
  } finally {
    controller.signal.removeEventListener('abort', observedCancel)
    if (work.controller === controller) work.controller = null
  }
}

function describeAnswerModel(observation: OperationContext | undefined, connection: AnswerConnection): void {
  if (!observation) return
  observation.model = connection.settings.llm.model
  observation.serviceSource = connection.platform ? 'platform' : 'custom'
  observation.providerType = 'llm'
}
