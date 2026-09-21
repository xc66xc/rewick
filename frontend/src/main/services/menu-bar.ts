import { Menu, Tray, nativeImage } from 'electron'
import brandIcon from '../../renderer/src/assets/rewick-icon.png?inline'
import trayIcon from '../assets/rewickTemplate.png?inline'
import trayIconRetina from '../assets/rewickTemplate@2x.png?inline'

/** Tray visibility is deliberately limited to the current run. */
export class MenuBar {
  private tray: Tray | null = null
  constructor(private readonly showWindow: () => void, private readonly hideWindow: () => void,
    private readonly quit: () => void) {}

  restore(): void {
    if (this.tray && !this.tray.isDestroyed()) return
    const isMac = process.platform === 'darwin'
    const image = isMac ? nativeImage.createFromDataURL(trayIcon) : nativeImage.createFromDataURL(brandIcon).resize({ width: 32, height: 32 })
    if (isMac) {
      image.addRepresentation({ scaleFactor: 2, dataURL: trayIconRetina })
      image.setTemplateImage(true)
    }
    const tray = new Tray(image)
    this.tray = tray
    tray.setToolTip('掌灯 Rewick')
    tray.on('click', this.showWindow)
    tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: '掌灯 Rewick', enabled: false },
      { type: 'separator' },
      { label: '显示窗口', click: this.showWindow },
      { label: '隐藏窗口', click: this.hideWindow },
      { type: 'separator' },
      { label: isMac ? '隐藏菜单栏图标' : '隐藏托盘图标', click: () => this.hide() },
      { type: 'separator' },
      { label: '退出掌灯 Rewick', click: this.quit }
    ])))
  }

  hide(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
