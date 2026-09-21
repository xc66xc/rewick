import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('electron', () => ({
  BaseWindow: class extends EventEmitter {
    visible = false
    destroyed = false
    contentView = { addChildView() {}, removeChildView() {} }
    getContentSize() { return [800, 600] }
    isDestroyed() { return this.destroyed }
    isVisible() { return this.visible }
    isMinimized() { return false }
    restore() {}
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() {}
    destroy() { this.destroyed = true; this.emit('closed') }
    close() { const event = { preventDefault: vi.fn() }; this.emit('close', event); if (!event.preventDefault.mock.calls.length) this.destroy() }
    setContentProtection() {}
    setAlwaysOnTop() {}
  },
  WebContentsView: class {
    webContents = { close: vi.fn(), isDestroyed: () => false }
    setBackgroundColor() {}
    setBounds() {}
  }
}))
import { DesktopWindows } from '../../src/main/services/desktop-windows'
import { defaultWindowPreferences } from '../../src/shared/window-preferences'

describe('resident desktop windows', () => {
  it('hides ordinary close without disposing the renderer; quits when prepared', () => {
    const disposed = vi.fn(), notice = vi.fn()
    const windows = new DesktopWindows({}, defaultWindowPreferences, vi.fn(), disposed, notice)
    windows.show()
    windows.full.close()
    expect(windows.full.isVisible()).toBe(false)
    expect(windows.full.isDestroyed()).toBe(false)
    expect(disposed).not.toHaveBeenCalled()
    expect(notice).toHaveBeenCalledOnce()
    windows.show()
    expect(windows.full.isVisible()).toBe(true)
    windows.prepareQuit()
    windows.full.close()
    expect(disposed).toHaveBeenCalledOnce()
  })
  it('keeps the shared renderer and stays hidden when compact mode ends', () => {
    const windows = new DesktopWindows({}, defaultWindowPreferences, vi.fn(), vi.fn(), vi.fn())
    windows.show()
    const contents = windows.active.webContents
    windows.setCompact(true)
    windows.hide()
    windows.setCompact(false)
    expect(windows.active).toBe(windows.full)
    expect(windows.active.isVisible()).toBe(false)
    expect(windows.active.webContents).toBe(contents)
    windows.show()
    expect(windows.full.isVisible()).toBe(true)
  })
  it('returns to the visible main window when the compact close button is clicked', () => {
    const windows = new DesktopWindows({}, defaultWindowPreferences, vi.fn(), vi.fn(), vi.fn())
    windows.show()
    windows.setCompact(true)
    windows.active.close()
    expect(windows.active).toBe(windows.full)
    expect(windows.full.isVisible()).toBe(true)
  })
})
