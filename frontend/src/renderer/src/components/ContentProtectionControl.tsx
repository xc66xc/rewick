import { ToggleSwitch } from './ui/switch'

interface ContentProtectionControlProps {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}

export default function ContentProtectionControl({ checked, disabled, onChange }: ContentProtectionControlProps) {
  return <div className="space-y-2">
    <ToggleSwitch label="共享保护" checked={checked} disabled={disabled} onCheckedChange={onChange} />
    <p className="text-xs leading-relaxed text-text-secondary">常规与紧凑窗口共用此设置，立即生效并自动保存在本机。</p>
    <p className="text-xs leading-relaxed text-text-secondary">尝试让应用窗口在截图或屏幕共享中不可见。实际效果取决于操作系统及会议软件；macOS 使用 ScreenCaptureKit 的共享方式可能仍可捕获，请共享前验证。</p>
  </div>
}
