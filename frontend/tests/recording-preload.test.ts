import { beforeEach, expect, it, vi } from 'vitest'
import type { DesktopBridge } from '../src/shared/types'

const electron = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn(), send: vi.fn() }))
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: electron.expose }, ipcRenderer: electron }))
beforeEach(async () => {
  vi.resetModules()
  electron.expose.mockClear(); electron.invoke.mockReset()
  electron.invoke.mockResolvedValue(null)
  await import('../src/preload/index')
})
function bridge(): DesktopBridge {
  return electron.expose.mock.calls[0][1] as DesktopBridge
}
it('queries resource status through the scoped recording bridge', async () => {
  await bridge().withAccountScope?.('account-one').recordings?.resourceStatus()
  expect(electron.invoke).toHaveBeenCalledWith('recordings:resource-status', { payload: undefined, accountScope: 'account-one' })
})
it.each([undefined, false, true])('passes explicit download consent without accepting URLs (%s)', async allowResourceDownload => {
  await bridge().withAccountScope?.('account-one').recordings?.exportReview('session-one', allowResourceDownload === undefined ? undefined : { allowResourceDownload })
  expect(electron.invoke).toHaveBeenCalledWith('recordings:export', { payload: { sessionId: 'session-one', allowResourceDownload: allowResourceDownload === true }, accountScope: 'account-one' })
})
