import type { RetrievalContext } from '../../shared/types'

type Retrieval = (signal: AbortSignal) => Promise<RetrievalContext>

/** Each supplier reports its own downgrade; authentication and cancellation errors still stop both branches. */
export async function retrieveAnswerContext(rag: Retrieval, web: Retrieval | undefined, signal: AbortSignal): Promise<RetrievalContext> {
  signal.throwIfAborted()
  const controller = new AbortController()
  const cancel = () => controller.abort(signal.reason)
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const [references, internet] = await Promise.all([rag(controller.signal), web?.(controller.signal)])
    signal.throwIfAborted()
    if (!internet || internet.status === 'disabled') return references
    const excerpts = [...references.excerpts, ...internet.excerpts]
    const message = [references.message, internet.message].filter(Boolean).join('\n')
    const status = references.status === 'degraded' || internet.status === 'degraded' ? 'degraded'
      : excerpts.length ? 'ready' : 'empty'
    return { ...references, status, excerpts, web: internet.web,
      ...(message ? { message } : {}) }
  } catch (error) {
    controller.abort(error)
    throw error
  } finally { signal.removeEventListener('abort', cancel) }
}
