import { screenshotShortcutSchema, type ScreenshotShortcutSettings } from '../../shared/screenshot-shortcut'
import { readJson, writeJsonAtomic } from './storage'

interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

/** Device-local screenshot shortcut and code language, independent of cloud settings. */
export class ScreenshotShortcutManager {
  private settings: ScreenshotShortcutSettings = { accelerator: '', language: 'Java' }
  private ownedKey = ''
  private saving = false
  private lastTrigger = -Infinity
  constructor(private readonly path: string, private readonly registry: ShortcutRegistry,
    private readonly trigger: () => void, private readonly reserved: (accelerator: string) => boolean = () => false) {}
  private readonly callback = () => {
    const now = performance.now(), repeated = now - this.lastTrigger < 400
    this.lastTrigger = now
    if (!repeated) this.trigger()
  }
  get(): ScreenshotShortcutSettings { return { ...this.settings } }
  async initialize(): Promise<void> {
    const raw = await readJson(this.path, 4096)
    if (raw === undefined) return
    this.settings = screenshotShortcutSchema.parse(raw)
    const key = this.settings.accelerator
    if (key) {
      if (this.reserved(key) || !this.registry.register(key, this.callback)) this.settings.error = '截图快捷键已被占用，请在设置中重新指定。'
      else this.ownedKey = key
    }
  }
  async save(input: unknown): Promise<ScreenshotShortcutSettings> {
    const next = screenshotShortcutSchema.parse(input)
    if (this.saving) throw new Error('快捷键正在保存，请稍后再试。')
    if (next.accelerator && this.reserved(next.accelerator)) throw new Error('该快捷键已用于音源切换，请换一个组合。')
    this.saving = true
    let registered = false
    try {
      if (next.accelerator && (next.accelerator !== this.settings.accelerator || this.settings.error)) {
        if (!this.registry.register(next.accelerator, this.callback)) throw new Error('快捷键已被占用或系统不支持，请换一个组合。')
        registered = true
      }
      await writeJsonAtomic(this.path, next)
      if (this.ownedKey && this.ownedKey !== next.accelerator) this.registry.unregister(this.ownedKey)
      this.ownedKey = next.accelerator
      this.settings = next
      return this.get()
    } catch (error) {
      if (registered) this.registry.unregister(next.accelerator)
      throw error
    } finally { this.saving = false }
  }
}
