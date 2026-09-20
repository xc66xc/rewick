import { useState } from 'react'
import type { WindowPreferences } from '../../../shared/window-preferences'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'
import { AppSelect } from './ui/select'
import { ToggleSwitch } from './ui/switch'

export default function CompactAppearance({ preferences, saving, onChange }: {
  preferences: WindowPreferences
  saving: boolean
  onChange: (value: WindowPreferences) => void
}) {
  const [open, setOpen] = useState(false)
  return <>
    <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-1 text-[11px] text-text-secondary">
      <span>{preferences.contentProtection ? '共享保护已开启（尽力保护）' : '共享保护未开启'}</span>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>透明与共享设置</Button>
    </div>
    <Modal open={open} onOpenChange={setOpen} title="透明与共享设置" bodyClassName="space-y-5">
      <div className="space-y-2"><label htmlFor="compact-opacity" className="text-sm text-text-primary">背景不透明度</label>
        <AppSelect id="compact-opacity" value={String(preferences.backgroundOpacity)} disabled={saving}
          options={[0, 20, 35, 50, 65, 80].map(value => ({ value: String(value), label: `${value}%${value === 0 ? ' · 完全透明' : ''}` }))}
          onValueChange={value => onChange({ ...preferences, backgroundOpacity: Number(value) })} />
        <p className="text-xs text-text-secondary">仅改变背景，文字保持清晰。可拖动顶部移动窗口，拖动边缘调整大小。</p>
      </div>
      <ToggleSwitch label="共享保护" checked={preferences.contentProtection} disabled={saving}
        onCheckedChange={value => onChange({ ...preferences, contentProtection: value })} />
      <p className="text-xs leading-relaxed text-text-secondary">共享保护仅对紧凑窗口生效，无法保证所有录屏或会议软件都隐藏窗口。macOS 使用 ScreenCaptureKit 的共享方式可能仍可捕获。共享前请用会议软件预览或另一台设备验证。</p>
    </Modal>
  </>
}
