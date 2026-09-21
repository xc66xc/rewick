import { ToggleSwitch } from './ui/switch'

interface ContentProtectionControlProps {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}

export default function ContentProtectionControl({ checked, disabled, onChange }: ContentProtectionControlProps) {
  return <div className="space-y-2">
    <ToggleSwitch label="共享保护" checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </div>
}
