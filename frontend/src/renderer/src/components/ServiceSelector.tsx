import { useId } from 'react'
import type { CustomServiceProfile, ServiceKind, ServiceSelection, Settings } from '../../../shared/types'
import { platformChoices, serviceLabels } from '../hooks/serviceChoices'
import styles from '../styles/App.module.css'

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
  return <div>
    <label className={styles.field} htmlFor={id}>{serviceLabels[kind]}<select id={id} value={value} aria-describedby={`${id}-note`}
      onChange={event => {
        if (event.target.value === 'new') { onCustom(); return }
        const [source, ...parts] = event.target.value.split(':')
        if (source === 'platform' || source === 'custom') onChange({ source, id: parts.join(':') })
      }}>
      <option value="" disabled>请选择服务</option>
      {selection && !available && <option value={value} disabled>所选服务已不可用，请重新选择</option>}
      <optgroup label="平台提供">{platform.length ? platform.map(item => <option key={item.id} value={`platform:${item.id}`}>{item.name}</option>) : <option disabled value="platform-unavailable">平台暂未提供</option>}</optgroup>
      <optgroup label="我的自定义">{custom.length ? custom.map(item => <option key={item.id} value={`custom:${item.id}`}>{item.name}</option>) : <option disabled value="custom-empty">尚无自定义服务</option>}</optgroup>
      <option value="new">+ 自定义模型/服务…</option>
    </select></label>
    <p id={`${id}-note`} className={selection && !available ? styles.inlineError : styles.fieldHint} role={selection && !available ? 'alert' : undefined}>
      {selection && !available ? '原服务已删除或下架，请明确选择其他服务后保存。' : '按所选服务连接；平台配置由管理员维护。'}</p>
    {profile && <div className={styles.platformActions}>
      <button type="button" className={styles.secondaryButton} onClick={() => onCustom(profile)}>编辑{serviceLabels[kind]}</button>
      <button type="button" className={styles.textButton} onClick={() => onRemove(profile)}>删除{serviceLabels[kind]}</button>
    </div>}
  </div>
}
