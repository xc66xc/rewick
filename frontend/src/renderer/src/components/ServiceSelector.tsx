import { useId } from 'react'
import type { CustomServiceProfile, ServiceKind, ServiceSelection, Settings } from '../../../shared/types'
import { platformChoices, serviceLabels } from '../hooks/serviceChoices'
import { Button } from './ui/button'
import { AppSelect } from './ui/select'
import type { SelectOption } from './ui/select'
import { fieldClass, inlineErrorClass } from '../lib/form'

interface ServiceSelectorProps {
  kind: ServiceKind; settings: Settings; selection?: ServiceSelection
  onChange: (selection: ServiceSelection) => void; onCustom: (profile?: CustomServiceProfile) => void; onRemove: (profile: CustomServiceProfile) => void
}
export default function ServiceSelector({ kind, settings, selection, onChange, onCustom, onRemove }: ServiceSelectorProps) {
  const id = useId()
  const platform = platformChoices(settings, kind)
  const custom = settings.customServices?.filter(profile => profile.kind === kind) ?? []
  const profile = selection?.source === 'custom' ? custom.find(item => item.id === selection.id) : undefined
  const available = selection?.source === 'platform' ? platform.some(item => item.id === selection.id) : Boolean(profile)
  const value = selection ? `${selection.source}:${selection.id}` : ''
  const invalid = Boolean(selection && !available)
  // 分组顺序固定「平台提供 → 我的自定义」;空组保留一条禁用占位,失效选择以禁用项展示告警文案。
  const platformOptions: SelectOption[] = platform.length
    ? platform.map(item => ({ value: `platform:${item.id}`, label: item.name, group: '平台提供' }))
    : [{ value: 'platform-unavailable', label: '平台暂未提供', group: '平台提供', disabled: true }]
  const customOptions: SelectOption[] = custom.length
    ? custom.map(item => ({ value: `custom:${item.id}`, label: item.name, group: '我的自定义' }))
    : [{ value: 'custom-empty', label: '尚无自定义服务', group: '我的自定义', disabled: true }]
  const options: SelectOption[] = invalid
    ? [{ value, label: '所选服务已不可用，请重新选择', disabled: true }, ...platformOptions, ...customOptions]
    : [...platformOptions, ...customOptions]
  return <div>
    <label className={fieldClass} htmlFor={id}>{serviceLabels[kind]}<AppSelect id={id} value={value || null} placeholder="请选择服务" options={options}
      newItem={{ value: 'new', label: '自定义模型/服务…' }} aria-describedby={invalid ? `${id}-note` : undefined} aria-invalid={invalid || undefined}
      onValueChange={next => {
        if (next === 'new') { onCustom(); return }
        const [source, ...parts] = next.split(':')
        if (source === 'platform' || source === 'custom') onChange({ source, id: parts.join(':') })
      }} /></label>
    {invalid && <p id={`${id}-note`} className={inlineErrorClass} role="alert">原服务已删除或下架，请明确选择其他服务后保存。</p>}
    {profile && <div className="mb-4 flex flex-wrap gap-2">
      <Button size="sm" onClick={() => onCustom(profile)}>编辑{serviceLabels[kind]}</Button>
      <Button size="sm" variant="quiet" className="text-danger hover:bg-danger-subtle" onClick={() => onRemove(profile)}>删除{serviceLabels[kind]}</Button>
    </div>}
  </div>
}
