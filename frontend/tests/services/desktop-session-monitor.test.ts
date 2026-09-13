import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopSessionMonitor } from '../../src/main/services/desktop-session-monitor'
import { SessionFault, onSessionFault } from '../../src/main/services/session-fault'
import { PlatformClient } from '../../src/main/services/platform-client'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function fixture() {
  let token = 'session-A'
  const check = vi.fn(async (): Promise<void> => undefined)
  const invalidated = vi.fn(async () => undefined)
  const paused = vi.fn(async () => undefined)
  const restored = vi.fn()
  const monitor = new DesktopSessionMonitor({ connection: async () => ({ token, baseUrl: 'http://localhost:8080' }), check, invalidated, paused, restored })
  return { monitor, check, invalidated, paused, restored, switchToken: () => { token = 'session-B' } }
}
describe('desktop session supervision', () => {
  it('restores an existing token without requesting password login and checks while idle', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.monitor.start()
    await vi.advanceTimersByTimeAsync(1)
    expect(() => f.monitor.assertVerified()).not.toThrow()
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.check).toHaveBeenCalledTimes(2)
    expect(f.check).toHaveBeenCalledWith({ token: 'session-A', baseUrl: 'http://localhost:8080' })
    f.monitor.dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.check).toHaveBeenCalledTimes(2)
  })
  it('reports replacement distinctly and never retries password authentication', async () => {
    const f = fixture()
    f.check.mockRejectedValue(new SessionFault('session_replaced'))
    await f.monitor.check()
    expect(f.invalidated).toHaveBeenCalledWith('session-A', expect.stringContaining('其他设备'))
    expect(f.paused).not.toHaveBeenCalled()
  })
  it('stops protected work after connectivity expires, then permits recovery with the same token', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.monitor.start()
    await vi.advanceTimersByTimeAsync(1)
    f.check.mockRejectedValue(new Error('offline'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.paused).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(f.paused).toHaveBeenCalledOnce()
    expect(f.invalidated).not.toHaveBeenCalled()
    expect(() => f.monitor.assertVerified()).toThrow('确认登录状态')
    f.check.mockResolvedValue(undefined)
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.restored).toHaveBeenCalledOnce()
    expect(() => f.monitor.assertVerified()).not.toThrow()
    f.monitor.dispose()
  })
  it('does not revoke a newer login when an old check returns late', async () => {
    const f = fixture()
    let reject: (error: Error) => void = () => undefined
    f.check.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    const work = f.monitor.check()
    await Promise.resolve()
    f.switchToken()
    reject(new SessionFault('session_replaced'))
    await work
    expect(f.invalidated).not.toHaveBeenCalled()
  })
  it('waits for an in-flight check and verifies a newly issued credential before returning', async () => {
    const f = fixture()
    let complete: () => void = () => undefined
    f.check.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve }))
    const oldCheck = f.monitor.check()
    await Promise.resolve()
    f.switchToken()
    const ready = f.monitor.ensureVerified()
    complete()
    await Promise.all([oldCheck, ready])
    expect(f.check).toHaveBeenCalledTimes(2)
    expect(f.check).toHaveBeenLastCalledWith({ token: 'session-B', baseUrl: 'http://localhost:8080' })
    expect(() => f.monitor.assertVerified('session-B')).not.toThrow()
    expect(() => f.monitor.assertVerified('session-A')).toThrow()
  })
  it('propagates only safe session reasons together with the originating token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'session_replaced', message: 'untrusted secret' }, { status: 401 })))
    const observer = vi.fn()
    const unsubscribe = onSessionFault(observer)
    try {
      await expect(new PlatformClient('http://localhost:8080').session('session-A')).rejects.toThrow('其他设备')
      expect(observer).toHaveBeenCalledWith('session-A', expect.any(SessionFault))
      expect(observer.mock.calls[0][1].message).not.toContain('untrusted')
    } finally { unsubscribe() }
  })
})
