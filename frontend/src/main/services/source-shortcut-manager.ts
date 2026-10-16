import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizeSourceShortcut, sourceShortcutSchema, type SourceShortcutSettings } from '../../shared/source-shortcut'

interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

/** Owns one OS binding and its device-local persistence, independently of accounts. */
export class SourceShortcutManager {
  private accelerator = ''
  private error?: string
  private saving = false
  private lastTrigger = -Infinity
  constructor(private readonly path: string, private readonly registry: ShortcutRegistry, private readonly trigger: () => void) {}
  private readonly callback = () => {
    const now = performance.now()
    const repeated = now - this.lastTrigger < 400
    this.lastTrigger = now
    if (!repeated) this.trigger()
  }
  get(): SourceShortcutSettings { return { accelerator: this.accelerator, ...(this.error ? { error: this.error } : {}) } }
  async initialize(): Promise<void> {
    let text: string
    try { text = await readFile(this.path, 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    const value = normalizeSourceShortcut(sourceShortcutSchema.parse(JSON.parse(text)).accelerator)
    this.accelerator = value
    if (value && !this.registry.register(value, this.callback)) this.error = '音源切换快捷键已被占用，请在设置中重新指定。'
  }
  async save(input: unknown): Promise<SourceShortcutSettings> {
    const value = normalizeSourceShortcut(sourceShortcutSchema.parse(input).accelerator)
    if (this.saving) throw new Error('快捷键正在保存，请稍后再试。')
    this.saving = true
    let registered = false
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      if (value && (value !== this.accelerator || this.error)) {
        if (!this.registry.register(value, this.callback)) throw new Error('快捷键已被占用或系统不支持，请换一个组合。')
        registered = true
      }
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(temporary, JSON.stringify({ accelerator: value }), { mode: 0o600 })
      await rename(temporary, this.path)
      if (this.accelerator && value !== this.accelerator) this.registry.unregister(this.accelerator)
      this.accelerator = value
      this.error = undefined
      return this.get()
    } catch (error) {
      if (registered) this.registry.unregister(value)
      await unlink(temporary).catch(() => undefined)
      throw error
    } finally { this.saving = false }
  }
}
