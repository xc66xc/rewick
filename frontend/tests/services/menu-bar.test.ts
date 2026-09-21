import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const state = vi.hoisted(() => ({ trays: [] as any[], menu: [] as any[], template: vi.fn(), resize: vi.fn() }))
vi.mock('electron', () => ({
  Tray: class extends EventEmitter {
    destroyed = false
    constructor() { super(); state.trays.push(this) }
    setToolTip() {}
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true }
    popUpContextMenu(menu: any[]) { state.menu = menu }
  },
  Menu: { buildFromTemplate: (items: any[]) => items },
  nativeImage: { createFromDataURL: () => {
    const image = { addRepresentation() {}, setTemplateImage: state.template, resize: (size: unknown) => { state.resize(size); return image } }
    return image
  } }
}))
import { MenuBar } from '../../src/main/services/menu-bar'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
afterEach(() => Object.defineProperty(process, 'platform', platform))
beforeEach(() => { state.trays = []; state.menu = []; state.template.mockClear(); state.resize.mockClear() })
describe('desktop tray', () => {
  it.each(['darwin', 'win32'])('%s: shows on click, hides independently and restores a single icon', platform => {
    Object.defineProperty(process, 'platform', { configurable: true, value: platform })
    const show = vi.fn(), hide = vi.fn(), quit = vi.fn()
    const bar = new MenuBar(show, hide, quit)
    bar.restore()
    if (platform === 'darwin') expect(state.template).toHaveBeenCalledWith(true)
    else {
      expect(state.template).not.toHaveBeenCalled()
      expect(state.resize).toHaveBeenCalledWith({ width: 32, height: 32 })
    }
    const tray = state.trays[0]
    tray.emit('click')
    expect(show).toHaveBeenCalledOnce()
    tray.emit('right-click')
    state.menu.find(item => item.label === '隐藏窗口').click()
    expect(hide).toHaveBeenCalledOnce()
    expect(tray.destroyed).toBe(false)
    state.menu.find(item => item.label === (platform === 'darwin' ? '隐藏菜单栏图标' : '隐藏托盘图标')).click()
    expect(tray.destroyed).toBe(true)
    expect(hide).toHaveBeenCalledOnce()
    expect(quit).not.toHaveBeenCalled()
    bar.restore()
    bar.restore()
    expect(state.trays).toHaveLength(2)
    state.trays[1].emit('right-click')
    state.menu.find(item => item.label === '退出掌灯 Rewick').click()
    expect(quit).toHaveBeenCalledOnce()
  })
})
