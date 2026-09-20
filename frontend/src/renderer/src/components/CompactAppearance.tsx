import { useState, type ReactNode } from 'react'
import { SlidersHorizontal, ShieldCheck, ShieldSlash } from '@phosphor-icons/react'
import type { WindowPreferences } from '../../../shared/window-preferences'
import { IconButton } from './ui/button'
import { Modal } from './ui/dialog'
import { Slider } from './ui/slider'
import { ToggleSwitch } from './ui/switch'

export default function CompactAppearance({ preferences, saving, onChange, onPreview, children }: {
  children?: ReactNode
  preferences: WindowPreferences
  saving: boolean
  onPreview: (value: number) => void
  onChange: (value: WindowPreferences) => void
}) {
  const [open, setOpen] = useState(false)
  return <>
    <IconButton aria-label="透明与共享设置" title={preferences.contentProtection ? '透明与共享设置 · 共享保护已开启（尽力保护）' : '透明与共享设置 · 共享保护未开启'} onClick={() => setOpen(true)}><SlidersHorizontal /></IconButton>
    <Modal open={open} onOpenChange={setOpen} title="透明与共享设置" bodyClassName="space-y-5">
      <p className="flex items-center gap-2 text-sm text-text-secondary">{preferences.contentProtection ? <ShieldCheck aria-hidden="true" /> : <ShieldSlash aria-hidden="true" />}{preferences.contentProtection ? '共享保护已开启（尽力保护）' : '共享保护未开启'}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3"><label htmlFor="compact-opacity" className="text-sm text-text-primary">背景不透明度</label><output htmlFor="compact-opacity" className="font-mono text-sm tabular-nums text-text-primary">{preferences.backgroundOpacity}%</output></div>
        <Slider id="compact-opacity" value={preferences.backgroundOpacity} min={0} max={80} step={1} disabled={saving}
          aria-valuetext={`背景不透明度 ${preferences.backgroundOpacity}%`}
          onValueChange={onPreview} onValueCommit={value => onChange({ ...preferences, backgroundOpacity: value })} />
        <div className="flex justify-between text-xs text-text-secondary"><span>0% · 全透明</span><span>80% · 更清晰</span></div>
        <p className="text-xs text-text-secondary">仅改变背景，文字保持清晰。可拖动顶部移动窗口，拖动边缘调整大小。</p>
      </div>
      <ToggleSwitch label="共享保护" checked={preferences.contentProtection} disabled={saving}
        onCheckedChange={value => onChange({ ...preferences, contentProtection: value })} />
      <p className="text-xs leading-relaxed text-text-secondary">共享保护仅对紧凑窗口生效，无法保证所有录屏或会议软件都隐藏窗口。macOS 使用 ScreenCaptureKit 的共享方式可能仍可捕获。共享前请用会议软件预览或另一台设备验证。</p>
      {children}
    </Modal>
  </>
}
