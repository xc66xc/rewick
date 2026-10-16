import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SourceShortcutManager } from '../../src/main/services/source-shortcut-manager'
import { normalizeSourceShortcut } from '../../src/shared/source-shortcut'

const directories: string[] = []
afterEach(async () => { vi.useRealTimers(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'source-shortcut-')); directories.push(directory)
  const path = join(directory, 'shortcut.json')
  const callbacks = new Map<string, () => void>()
  const register = vi.fn((key: string, action: () => void) => { callbacks.set(key, action); return true })
  const unregister = vi.fn((key: string) => { callbacks.delete(key) })
  const trigger = vi.fn()
  return { directory, path, callbacks, register, unregister, trigger, manager: new SourceShortcutManager(path, { register, unregister }, trigger) }
}
describe('device-local source shortcut', () => {
  it.each(['Shift+Q', 'Q', 'Alt+Alt+Q', 'Ctrl+Shift+R', 'Cmd+Shift+Enter'])('rejects invalid or reserved %s', value => {
    expect(() => normalizeSourceShortcut(value)).toThrow()
  })
  it('normalizes aliases and modifier order', () => {
    expect(normalizeSourceShortcut('shift+cmd+q')).toBe('CommandOrControl+Shift+Q')
    expect(normalizeSourceShortcut('alt+ctrl+q')).toBe('CommandOrControl+Alt+Q')
    expect(normalizeSourceShortcut('')).toBe('')
  })
  it('persists, reloads and clears the binding independently of any account', async () => {
    const value = await setup()
    await value.manager.initialize()
    await value.manager.save({ accelerator: 'Ctrl+Alt+Q' })
    const replacement = new SourceShortcutManager(value.path, { register: value.register, unregister: value.unregister }, value.trigger)
    await replacement.initialize()
    expect(replacement.get().accelerator).toBe('CommandOrControl+Alt+Q')
    await replacement.save({ accelerator: '' })
    expect(JSON.parse(await readFile(value.path, 'utf8'))).toEqual({ accelerator: '' })
    expect(value.unregister).toHaveBeenCalledWith('CommandOrControl+Alt+Q')
  })
  it('preserves the previous binding and disk configuration when the new key is occupied', async () => {
    const value = await setup()
    await value.manager.save({ accelerator: 'Alt+Q' })
    value.register.mockReturnValueOnce(false)
    await expect(value.manager.save({ accelerator: 'Alt+W' })).rejects.toThrow('占用')
    expect(value.callbacks.has('Alt+Q')).toBe(true)
    expect(JSON.parse(await readFile(value.path, 'utf8'))).toEqual({ accelerator: 'Alt+Q' })
  })
  it('releases a new registration when persistence fails and keeps the old binding', async () => {
    const value = await setup()
    await value.manager.save({ accelerator: 'Alt+Q' })
    await rm(value.path)
    const { mkdir } = await import('node:fs/promises')
    await mkdir(value.path)
    await expect(value.manager.save({ accelerator: 'Alt+W' })).rejects.toThrow()
    expect(value.callbacks.has('Alt+Q')).toBe(true)
    expect(value.callbacks.has('Alt+W')).toBe(false)
    expect(value.manager.get().accelerator).toBe('Alt+Q')
  })
  it('reports a startup collision without replacing the saved shortcut', async () => {
    const value = await setup()
    await writeFile(value.path, JSON.stringify({ accelerator: 'Alt+Q' }))
    value.register.mockReturnValueOnce(false)
    await value.manager.initialize()
    expect(value.manager.get()).toMatchObject({ accelerator: 'Alt+Q', error: expect.stringContaining('占用') })
  })
  it('filters held-key repeat but accepts a new press after release', async () => {
    const value = await setup()
    await value.manager.save({ accelerator: 'Alt+Q' })
    vi.useFakeTimers()
    const press = value.callbacks.get('Alt+Q')
    press?.()
    for (let i = 0; i < 30; i++) { vi.advanceTimersByTime(40); press?.() }
    expect(value.trigger).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500); press?.()
    expect(value.trigger).toHaveBeenCalledTimes(2)
  })
})
