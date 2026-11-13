import type { ExtractedQuestion } from '../../shared/question-rewrite'
import type { RetrievalContext } from '../../shared/types'
import { aggregateQuestionEvidence } from './multi-question-evidence'
import { isRetrievalFatal, unavailableQuestions } from './reference-batch-client'

interface MultiQuestionRetrieval {
  questions: ExtractedQuestion[]
  references: (signal: AbortSignal) => Promise<RetrievalContext>
  web?: (question: ExtractedQuestion, signal: AbortSignal) => Promise<RetrievalContext>
  timeoutMs: number
  signal: AbortSignal
}

/** One bounded parent deadline covers batch RAG, queued web work and packing. Owner cancellation remains terminal. */
export async function retrieveQuestions(options: MultiQuestionRetrieval): Promise<RetrievalContext> {
  const { questions, signal: owner } = options
  owner.throwIfAborted()
  const budget = new AbortController()
  const signal = AbortSignal.any([owner, budget.signal])
  const webResults = new Map<string, RetrievalContext>()
  let references: RetrievalContext | undefined
  let sealed = false
  let timedOut = false
  let cursor = 0
  let rejectFailure: (error: unknown) => void = () => undefined
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject })
  const abortOwner = () => { sealed = true; rejectFailure(owner.reason) }
  owner.addEventListener('abort', abortOwner, { once: true })
  let closeBudget: () => void = () => undefined
  const expired = new Promise<void>(resolve => { closeBudget = resolve })
  const timer = setTimeout(() => {
    timedOut = true; sealed = true
    budget.abort(new DOMException('本轮检索预算已用尽。', 'TimeoutError'))
    closeBudget()
  }, options.timeoutMs)
  function failed(error: unknown): boolean {
    if (sealed) return true
    if (owner.aborted || isRetrievalFatal(error)) {
      sealed = true
      rejectFailure(owner.aborted ? owner.reason : error)
      budget.abort(error)
      return true
    }
    return false
  }
  const referenceWork = (async () => {
    try { const result = await options.references(signal); if (!sealed) references = result }
    catch (error) { if (!failed(error)) references = unavailableQuestions(questions, '分题资料检索暂不可用，本次使用已取得的内容回答。') }
  })()
  const webWorker = async () => {
    while (options.web && !sealed && !signal.aborted && cursor < questions.length) {
      const question = questions[cursor++]
      try {
        const result = await options.web(question, signal)
        if (!sealed) webResults.set(question.id, result)
      } catch (error) {
        if (failed(error)) return
        const message = '此问题的联网搜索暂不可用，本次继续回答。'
        webResults.set(question.id, { status: 'degraded', message, excerpts: [], web: { status: 'degraded', message } })
      }
    }
  }
  try {
    await Promise.race([Promise.all([referenceWork, ...(options.web ? [webWorker(), webWorker()] : [])]), failure, expired])
    owner.throwIfAborted()
    sealed = true
    return aggregateQuestionEvidence(questions, references, webResults, options.web !== undefined, timedOut)
  } finally {
    sealed = true
    clearTimeout(timer)
    owner.removeEventListener('abort', abortOwner)
  }
}
