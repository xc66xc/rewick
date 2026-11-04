import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScreenshotShortcutManager } from '../../src/main/services/screenshot-shortcut-manager'
const directories: string[] = []
afterEach(async () => { vi.useRealTimers(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function setup(reserved = (_: string) => false) {
  const directory = await mkdtemp(join(tmpdir(), 'screenshot-shortcut-')); directories.push(directory)
  const callbacks = new Map<string, () => void>()
  const register = vi.fn((key: string, callback: () => void) => { callbacks.set(key, callback); return true })
  const unregister = vi.fn((key: string) => { callbacks.delete(key) }), trigger = vi.fn(), path = join(directory, 'shortcut.json')
  return { manager: new ScreenshotShortcutManager(path, { register, unregister }, trigger, reserved), path, register, callbacks, trigger }
}
describe('screenshot shortcut settings', () => {
  it('persists the normalized shortcut with language and restores registration', async () => {
    const value = await setup()
    await value.manager.save({ accelerator: 'cmd+3', language: 'Python' })
    expect(JSON.parse(await readFile(value.path, 'utf8'))).toEqual({ accelerator: 'CommandOrControl+3', language: 'Python' })
    await value.manager.initialize()
    expect(value.manager.get()).toEqual({ accelerator: 'CommandOrControl+3', language: 'Python' })
  })
  it('rejects the audio-source chord without changing the existing setting', async () => {
    const value = await setup(key => key === 'Alt+Q')
    await expect(value.manager.save({ accelerator: 'alt+q', language: 'Java' })).rejects.toThrow('音源切换')
    expect(value.register).not.toHaveBeenCalled()
    expect(value.manager.get().accelerator).toBe('')
  })
  it('preserves the current chord and language if a new chord is occupied', async () => {
    const value = await setup()
    await value.manager.save({ accelerator: 'Alt+W', language: 'Java' })
    value.register.mockReturnValueOnce(false)
    await expect(value.manager.save({ accelerator: 'Alt+Q', language: 'C++' })).rejects.toThrow('占用')
    expect(value.manager.get()).toEqual({ accelerator: 'Alt+W', language: 'Java' })
  })
  it('reports startup collision and allows clearing without registering again', async () => {
    const value = await setup(() => true)
    await writeFile(value.path, JSON.stringify({ accelerator: 'Alt+Q', language: 'Java' }))
    await value.manager.initialize()
    expect(value.manager.get().error).toContain('占用')
    await value.manager.save({ accelerator: '', language: 'TypeScript' })
    expect(value.manager.get()).toEqual({ accelerator: '', language: 'TypeScript' })
  })
})
