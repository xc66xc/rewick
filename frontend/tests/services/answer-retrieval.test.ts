import { describe, expect, it, vi } from 'vitest'
import type { RetrievalContext } from '../../src/shared/types'
import { retrieveAnswerContext } from '../../src/main/services/answer-retrieval'

const rag: RetrievalContext = { status: 'ready', excerpts: [{ documentId: 'rag', chunkId: 'r1', revision: 1, kind: 'personal', name: '项目', text: '真实经历' }] }
const web: RetrievalContext = { status: 'ready', excerpts: [{ source: 'web', documentId: 'web:one', chunkId: 'w1', revision: 1, kind: 'technical', name: '官网', url: 'https://example.com', text: '网页正文' }], web: { status: 'ready' } }

describe('parallel answer retrieval', () => {
  it('starts both branches before either completes and retains deterministic source order', async () => {
    let release: (value: RetrievalContext) => void = () => undefined
    const first = vi.fn(() => new Promise<RetrievalContext>(resolve => { release = resolve }))
    const second = vi.fn(async () => web)
    const pending = retrieveAnswerContext(first, second, new AbortController().signal)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    release(rag)
    expect(await pending).toEqual({ ...rag, excerpts: [...rag.excerpts, ...web.excerpts], web: { status: 'ready' } })
  })

  it.each(['rag', 'web'] as const)('retains the other branch when %s reports degradation', async failed => {
    const degraded: RetrievalContext = { status: 'degraded', excerpts: [], message: '检索失败', ...(failed === 'web' ? { web: { status: 'degraded' as const, message: '检索失败' } } : {}) }
    const result = await retrieveAnswerContext(async () => failed === 'rag' ? degraded : rag, async () => failed === 'web' ? degraded : web, new AbortController().signal)
    expect(result.status).toBe('degraded')
    expect(result.excerpts).toEqual(failed === 'rag' ? web.excerpts : rag.excerpts)
    expect(result.message).toBe('检索失败')
  })

  it('supports web search with RAG disabled and no web request when its branch is absent', async () => {
    const controller = new AbortController()
    expect((await retrieveAnswerContext(async () => ({ status: 'disabled', excerpts: [] }), async () => web, controller.signal)).excerpts).toEqual(web.excerpts)
    expect(await retrieveAnswerContext(async () => rag, undefined, controller.signal)).toBe(rag)
  })

  it('aborts the sibling on terminal failure instead of treating authentication errors as degradation', async () => {
    let sibling: AbortSignal | undefined
    const error = new Error('登录失效')
    await expect(retrieveAnswerContext(async () => { throw error }, async signal => { sibling = signal; return web }, new AbortController().signal)).rejects.toBe(error)
    expect(sibling?.aborted).toBe(true)
  })

  it('discards responses arriving after the owner cancels', async () => {
    const controller = new AbortController()
    let release: (value: RetrievalContext) => void = () => undefined
    const pending = retrieveAnswerContext(() => new Promise(resolve => { release = resolve }), async () => web, controller.signal)
    controller.abort(new Error('账户已切换'))
    release(rag)
    await expect(pending).rejects.toThrow('账户已切换')
  })
})
