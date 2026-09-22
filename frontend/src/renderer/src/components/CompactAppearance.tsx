import { useState, type ReactNode } from 'react'
import { SlidersHorizontal, ShieldCheck, ShieldSlash } from '@phosphor-icons/react'
import type { WindowPreferences } from '../../../shared/window-preferences'
import { defaultCompactFontSize } from '../../../shared/window-preferences'
import { IconButton } from './ui/button'
import { Modal } from './ui/dialog'
import { Slider } from './ui/slider'
import ContentProtectionControl from './ContentProtectionControl'

export default function CompactAppearance({ preferences, saving, onChange, onPreview, onFontPreview, children }: {
  children?: ReactNode
  preferences: WindowPreferences
  saving: boolean
  onPreview: (value: number) => void
  onFontPreview?: (value: number) => void
  onChange: (value: WindowPreferences) => void
}) {
  const [open, setOpen] = useState(false)
  return <>
    <IconButton aria-label="透明与共享设置" title={preferences.contentProtection ? '透明与共享设置 · 共享保护已开启（尽力保护）' : '透明与共享设置 · 共享保护未开启'} onClick={() => setOpen(true)}><SlidersHorizontal /></IconButton>
    <Modal open={open} onOpenChange={setOpen} title="透明与共享设置" bodyClassName="space-y-5">
      <p className="flex items-center gap-2 text-sm text-text-secondary">{preferences.contentProtection ? <ShieldCheck aria-hidden="true" /> : <ShieldSlash aria-hidden="true" />}{preferences.contentProtection ? '共享保护已开启（尽力保护）' : '共享保护未开启'}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3"><label htmlFor="compact-opacity" className="text-sm text-text-primary">背景不透明度</label><output htmlFor="compact-opacity" className="font-mono text-sm tabular-nums text-text-primary">{preferences.backgroundOpacity}%</output></div>
        <Slider className="accent-accent" id="compact-opacity" value={preferences.backgroundOpacity} min={0} max={80} step={1} disabled={saving}
          aria-valuetext={`背景不透明度 ${preferences.backgroundOpacity}%`}
          onValueChange={onPreview} onValueCommit={value => onChange({ ...preferences, backgroundOpacity: value })} />
        <div className="flex justify-between text-xs text-text-secondary"><span>0% · 全透明</span><span>80% · 更清晰</span></div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3"><label htmlFor="compact-font-size" className="text-sm text-text-primary">字体大小</label><output htmlFor="compact-font-size" className="font-mono text-sm tabular-nums text-text-primary">{preferences.fontSize ?? defaultCompactFontSize}px</output></div>
        <Slider className="accent-accent" id="compact-font-size" value={preferences.fontSize ?? defaultCompactFontSize} min={14} max={28} step={1} disabled={saving}
          aria-valuetext={`字体大小 ${preferences.fontSize ?? defaultCompactFontSize} 像素`}
          onValueChange={value => onFontPreview?.(value)} onValueCommit={value => onChange({ ...preferences, fontSize: value })} />
        <div className="flex justify-between text-xs text-text-secondary"><span>14px</span><span>28px</span></div>
      </div>
      <ContentProtectionControl checked={preferences.contentProtection} disabled={saving}
        onChange={value => onChange({ ...preferences, contentProtection: value })} />
      {children}
    </Modal>
  </>
}
