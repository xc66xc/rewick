import { describe, expect, it, vi } from 'vitest'
import type { App } from 'electron'
import { enforcePackagedStartup } from '../../src/main/services/startup-security'

function application(isPackaged = true, switches: string[] = []) {
  return {
    isPackaged,
    commandLine: { hasSwitch: (name: string) => switches.includes(name) } as App['commandLine'],
    exit: vi.fn()
  }
}

describe('packaged startup security', () => {
  it.each([
    ['--remote-debugging-port=9222'], ['--remote-debugging-port', '9222'],
    ['--remote-debugging-port=0'], ['--remote-debugging-pipe'],
    ['--inspect=9229'], ['--inspect-brk'], ['--inspect-wait'], ['--inspect-port', '9229']
  ])('exits before initialization with debugging arguments %j', (...argv) => {
    const app = application()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => enforcePackagedStartup(app, ['app', ...argv])).toThrow('debugging is disabled')
    expect(app.exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledOnce()
  })

  it('also checks Chromium switches no longer present in argv', () => {
    const app = application(true, ['remote-debugging-pipe'])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => enforcePackagedStartup(app, ['app'])).toThrow()
    expect(app.exit).toHaveBeenCalledWith(1)
  })

  it('allows normal packaged startup', () => {
    const app = application()
    enforcePackagedStartup(app, ['app', '--disable-features=Example'])
    expect(app.exit).not.toHaveBeenCalled()
  })

  it('preserves development debugging', () => {
    const app = application(false, ['remote-debugging-port'])
    enforcePackagedStartup(app, ['app', '--inspect-brk'])
    expect(app.exit).not.toHaveBeenCalled()
  })
})
