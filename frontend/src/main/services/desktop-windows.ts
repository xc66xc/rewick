import { BaseWindow, WebContentsView } from 'electron'
import type { WebPreferences } from 'electron'
import type { WindowPreferences } from '../../shared/window-preferences'

/** Both native windows host the same renderer so audio, drafts and timers survive switching. */
export class DesktopHost extends BaseWindow {
  constructor(options: Electron.BaseWindowConstructorOptions, private readonly view: WebContentsView) { super(options) }
  get webContents() { return this.view.webContents }
}

export class DesktopWindows {
  readonly view: WebContentsView
  readonly full: DesktopHost
  private floating: DesktopHost | null = null
  private compact = false
  private pinned = false
  private quitting = false
  private closed = false
  get active(): DesktopHost { return this.compact && this.floating ? this.floating : this.full }
  constructor(webPreferences: WebPreferences, private preferences: WindowPreferences,
    private readonly changed: (window: DesktopHost, compact: boolean) => void,
    private readonly disposed: () => void) {
    this.view = new WebContentsView({ webPreferences })
    this.view.setBackgroundColor('#00000000')
    this.full = new DesktopHost({
      width: 1220, height: 820, minWidth: 900, minHeight: 640, show: false,
      title: '掌灯 Rewick', titleBarStyle: process.platform === 'win32' ? 'hidden' : 'hiddenInset',
      ...(process.platform === 'win32' ? { titleBarOverlay: { color: '#ffffff', symbolColor: '#2a2a2e', height: 50 } } : {}),
      trafficLightPosition: { x: 18, y: 20 }, backgroundColor: '#F7F6F3', autoHideMenuBar: true
    }, this.view)
    this.full.contentView.addChildView(this.view)
    this.watchSize(this.full)
    this.full.on('close', () => { this.quitting = true })
    this.full.on('closed', () => {
      this.closed = true
      this.floating?.destroy()
      if (!this.view.webContents.isDestroyed()) this.view.webContents.close()
      this.disposed()
    })
  }
  private watchSize(host: DesktopHost): void {
    const resize = () => {
      if (host !== this.active || host.isDestroyed()) return
      const [width, height] = host.getContentSize()
      this.view.setBounds({ x: 0, y: 0, width, height })
    }
    host.on('resize', resize)
    resize()
  }
  setCompact(value: boolean): void {
    if (this.closed || this.quitting || value === this.compact) return
    if (value && !this.floating) {
      this.floating = new DesktopHost({ width: 480, height: 640, minWidth: 430, minHeight: 500,
        frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
        show: false, title: '掌灯 Rewick · 紧凑模式', resizable: true }, this.view)
      this.floating.on('close', event => { if (!this.quitting) { event.preventDefault(); this.setCompact(false) } })
      this.watchSize(this.floating)
    }
    const previous = this.active
    const next = value ? this.floating! : this.full
    // Protect before attaching the renderer or making it visible.
    next.setContentProtection(value && this.preferences.contentProtection)
    next.setAlwaysOnTop(this.pinned, 'floating')
    previous.hide()
    previous.contentView.removeChildView(this.view)
    this.compact = value
    next.contentView.addChildView(this.view)
    const [width, height] = next.getContentSize()
    this.view.setBounds({ x: 0, y: 0, width, height })
    this.changed(next, value)
    if (next.isMinimized()) next.restore()
    next.show()
    next.focus()
  }
  setPinned(value: boolean): boolean { this.pinned = value; this.active.setAlwaysOnTop(value, 'floating'); return value }
  setPreferences(preferences: WindowPreferences): void {
    this.preferences = preferences
    this.floating?.setContentProtection(preferences.contentProtection)
  }
  prepareQuit(): void { this.quitting = true }
}
