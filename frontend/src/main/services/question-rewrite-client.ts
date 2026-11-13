import { randomUUID } from 'node:crypto'
import { questionExtractionResultSchema, singleQuestionRewriteResultSchema, rewriteTextLength, type QuestionRewriteReason, type QuestionRewriteResult } from '../../shared/question-rewrite'
import type { AnswerRequest, Settings } from '../../shared/types'
import { PlatformClient, PlatformRequestError } from './platform-client'
import { SessionFault } from './session-fault'

export function questionRewriteEnabled(settings: Settings, request: AnswerRequest): boolean {
  return request.mode !== 'algorithm' && settings.platform?.questionRewrite?.enabled === true
}

/** One short, optional preparation call. Cancellation is terminal; provider failures use the original question. */
export class QuestionRewriteClient {
  constructor(private readonly settings: Settings, private readonly token: string) {}

  async rewrite(request: AnswerRequest, signal: AbortSignal): Promise<QuestionRewriteResult | undefined> {
    signal.throwIfAborted()
    if (!questionRewriteEnabled(this.settings, request)) return
    const platform = this.settings.platform
    const extraction = platform?.questionRewrite?.resultFormats?.includes('questions-v1') === true
      && platform.questionRewrite.batchReferencesAvailable === true
    const platformVersion = platform?.platformVersion ?? 0
    const fallback = (status: 'skipped' | 'degraded', reason: QuestionRewriteReason, durationMs = 0): QuestionRewriteResult => ({
      status, ...(extraction ? { resultFormat: 'questions-v1' as const, questions: [] } : { question: null }), reason, model: null, durationMs, platformVersion,
    })
    if (rewriteTextLength(request.question) > 3000) return fallback('skipped', 'input_limit')
    if (!platform?.authenticated || !this.token) throw new Error('平台登录已失效，请重新登录。')
    const origin = { baseUrl: platform.baseUrl, token: this.token }
    const requestId = randomUUID()
    const started = performance.now()
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const timeoutMs = (platform.questionRewrite?.timeoutMs ?? 1500) + 500
    const timer = setTimeout(() => controller.abort(new DOMException('问题整理超时。', 'TimeoutError')), timeoutMs)
    let rejectAbort: (() => void) | undefined
    let submitted = false
    const notifyCancellation = () => {
      if (!submitted) return
      void new PlatformClient(origin.baseUrl, 2000).cancelQuestionRewrite(origin.token, requestId, AbortSignal.timeout(2000))
        .catch(() => console.warn('问题整理取消通知未送达；服务器仍受超时和会话租约限制。'))
    }
    controller.signal.addEventListener('abort', notifyCancellation, { once: true })
    try {
      const cancelled = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason)
        controller.signal.addEventListener('abort', rejectAbort, { once: true })
        if (controller.signal.aborted) rejectAbort()
      })
      controller.signal.throwIfAborted()
      submitted = true
      const result = await Promise.race([
        new PlatformClient(origin.baseUrl, timeoutMs).rewriteQuestion(origin.token, request.question, request.rewriteContext ?? [], requestId, controller.signal, extraction ? 'questions-v1' : undefined),
        cancelled,
      ])
      signal.throwIfAborted()
      controller.signal.throwIfAborted()
      return extraction ? questionExtractionResultSchema.parse(result) : singleQuestionRewriteResultSchema.parse(result)
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof SessionFault || error instanceof PlatformRequestError && [401, 402, 403, 409].includes(error.status ?? 0)) throw error
      const reason = controller.signal.aborted || error instanceof Error && /超时/.test(error.message) ? 'timeout'
        : error instanceof PlatformRequestError && error.status === 429 ? 'busy'
          : error instanceof Error && error.name === 'ZodError' ? 'invalid_output' : 'provider_error'
      return fallback('degraded', reason, Math.max(0, performance.now() - started))
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      controller.signal.removeEventListener('abort', notifyCancellation)
      if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort)
    }
  }
}
