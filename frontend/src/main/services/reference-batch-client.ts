import { randomUUID } from 'node:crypto'
import type { ExtractedQuestion } from '../../shared/question-rewrite'
import type { RetrievalContext, Settings } from '../../shared/types'
import { PlatformClient, PlatformRequestError } from './platform-client'
import { SessionFault } from './session-fault'
import { batchReferenceResponseSchema } from './validation'

export interface PlatformOrigin { baseUrl: string; token: string }
export function isRetrievalFatal(error: unknown): boolean {
  return error instanceof SessionFault || error instanceof PlatformRequestError && [401, 402, 403, 409].includes(error.status ?? 0)
}
export function unavailableQuestions(questions: ExtractedQuestion[], message: string, status: RetrievalContext['status'] = 'degraded'): RetrievalContext {
  return { status, message, excerpts: [], queries: questions.map(question => ({ questionId: question.id, status, message, excerptIds: [] })) }
}

/** One parent request freezes credentials and owns every backend child query and cancellation. */
export class ReferenceBatchClient {
  constructor(private readonly settings: Settings, private readonly origin: PlatformOrigin) {}
  async retrieve(questions: ExtractedQuestion[], signal: AbortSignal): Promise<RetrievalContext> {
    signal.throwIfAborted()
    if (!this.settings.retrieval.enabled) return unavailableQuestions(questions, '未启用参考资料。', 'disabled')
    const referenceIds = this.settings.interviewEnvironment?.referenceIds ?? []
    if (!referenceIds.length) return unavailableQuestions(questions, '当前面试环境未选择参考资料。', 'empty')
    if (!this.settings.platform?.authenticated || !this.origin.token) throw new SessionFault('session_expired')
    const requestId = randomUUID()
    const client = new PlatformClient(this.origin.baseUrl, 30_000)
    const cancel = () => {
      void client.cancelReferenceBatch(this.origin.token, requestId, AbortSignal.timeout(2000))
        .catch(() => console.warn('分题资料取消通知未送达；服务器仍受超时和会话租约限制。'))
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = batchReferenceResponseSchema.parse(await client.referenceBatch(this.origin.token,
        questions.map(question => ({ questionId: question.id, query: question.question })), referenceIds, requestId, signal))
      signal.throwIfAborted()
      if (result.queries.length !== questions.length || result.queries.some((query, index) => query.questionId !== questions[index]?.id)) {
        return unavailableQuestions(questions, '分题资料响应的问题列表无效，本次继续回答。')
      }
      return result
    } catch (error) {
      signal.throwIfAborted()
      if (isRetrievalFatal(error)) throw error
      return unavailableQuestions(questions, '分题资料检索暂不可用，本次使用已取得的内容回答。')
    } finally { signal.removeEventListener('abort', cancel) }
  }
}
