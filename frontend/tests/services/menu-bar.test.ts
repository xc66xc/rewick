import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const state = vi.hoisted(() => ({ trays: [] as any[], menu: [] as any[] }))
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
  nativeImage: { createFromDataURL: () => ({ addRepresentation() {}, setTemplateImage() {} }) }
}))
import { MenuBar } from '../../src/main/services/menu-bar'

beforeEach(() => { state.trays = []; state.menu = [] })
describe('macOS menu bar', () => {
  it('shows on left click and keeps hiding the window separate from hiding the icon', () => {
    const show = vi.fn(), hide = vi.fn(), quit = vi.fn()
    const bar = new MenuBar(show, hide, quit)
    bar.restore()
    const tray = state.trays[0]
    tray.emit('click')
    expect(show).toHaveBeenCalledOnce()
    tray.emit('right-click')
    state.menu.find(item => item.label === '隐藏窗口').click()
    expect(hide).toHaveBeenCalledOnce()
    expect(tray.destroyed).toBe(false)
    state.menu.find(item => item.label === '隐藏菜单栏图标').click()
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
