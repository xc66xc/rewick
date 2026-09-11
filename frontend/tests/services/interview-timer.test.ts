import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewTimer } from '../../src/main/services/interview-timer'
import type { WalletState } from '../../src/shared/types'

const connection = { baseUrl: 'http://127.0.0.1:8080', token: 'test-token' }
const requestId = '12345678-1234-4123-8123-123456789012'
function state(status: 'active' | 'ended' = 'active'): WalletState {
  const now = new Date().toISOString()
  return { availableSeconds: 120, version: 0, serverTime: now, session: { id: 'session', status, startedAt: now, expiresAt: new Date(Date.now() + 30000).toISOString(), endedAt: status === 'ended' ? now : null, usedSeconds: 0, endReason: status === 'ended' ? 'ended' : null } }
}
beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date', 'performance'] }))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('interview metering lease', () => {
  it('does not permit model use before start and a repeated accepted start is idempotent', async () => {
    const fetcher = vi.fn(async () => Response.json(state())); vi.stubGlobal('fetch', fetcher)
    const timer = new InterviewTimer(vi.fn(), vi.fn())
    expect(() => timer.assertActive()).toThrow('请先开始面试')
    const first = await timer.start(connection, requestId)
    expect(timer.active).toBe(true)
    expect(await timer.start(connection, requestId)).toEqual(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await expect(timer.start(connection, 'different')).rejects.toThrow('正在进行')
    await timer.end()
  })
  it('does not extend the lease on failed heartbeat and stops after 30 seconds', async () => {
    const changed = vi.fn(); const stopped = vi.fn()
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(state())).mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    const timer = new InterviewTimer(changed, stopped)
    await timer.start(connection, requestId)
    await vi.advanceTimersByTimeAsync(31000)
    expect(timer.active).toBe(false)
    expect(stopped).toHaveBeenCalledOnce()
    expect(changed.mock.calls.at(-1)?.[0].session.status).toBe('ended')
    expect(changed.mock.calls.at(-1)?.[0].availableSeconds).toBe(90)
  })
  it('stops locally before waiting for the server end response and retries the same session', async () => {
    const stopped = vi.fn()
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(state())).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json(state('ended')))
    vi.stubGlobal('fetch', fetcher)
    const timer = new InterviewTimer(vi.fn(), stopped)
    await timer.start(connection, requestId)
    const end = timer.end()
    expect(timer.active).toBe(false)
    expect(stopped).toHaveBeenCalledOnce()
    await expect(end).rejects.toThrow()
    expect((await timer.end())?.session?.status).toBe('ended')
    expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[2][0])
  })
  it('does not activate a late start response after logout/disposal', async () => {
    let resolveStart: (response: Response) => void = () => undefined
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveStart = resolve })).mockResolvedValue(Response.json(state('ended')))
    vi.stubGlobal('fetch', fetcher)
    const timer = new InterviewTimer(vi.fn(), vi.fn())
    const start = timer.start(connection, requestId)
    const rejected = expect(start).rejects.toThrow('已取消')
    timer.dispose()
    resolveStart(Response.json(state()))
    await rejected
    expect(timer.active).toBe(false)
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain('/session/end')
  })
  it('a server-ended heartbeat immediately stops ongoing work', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(state())).mockResolvedValueOnce(Response.json(state('ended'))))
    const stopped = vi.fn(); const timer = new InterviewTimer(vi.fn(), stopped)
    await timer.start(connection, requestId)
    await vi.advanceTimersByTimeAsync(10000)
    expect(timer.active).toBe(false)
    expect(stopped).toHaveBeenCalledOnce()
  })
})
