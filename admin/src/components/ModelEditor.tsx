import type { Model, Provider } from '../types'
import styles from '../styles.module.css'
interface ModelEditorProps { model: Model; providers: Provider[]; onChange: (model: Model) => void; actions: { remove: () => void; test: () => void }; disabled: boolean }
export default function ModelEditor({ model, providers, onChange, actions, disabled }: ModelEditorProps) {
  return <fieldset className={styles.editorCard} disabled={disabled} aria-label={`模型配置 ${model.name || model.id}`}><legend>{model.name || '新模型'}<span className={styles.tableDetail}>平台模型 ID：{model.id}</span></legend>
    <div className={styles.twoColumns}><label className={styles.field}>显示名称<input required maxLength={100} value={model.name} onChange={event => onChange({ ...model, name: event.target.value })} /></label><label className={styles.field}>所属服务<select required value={model.providerId} onChange={event => onChange({ ...model, providerId: event.target.value })}><option value="">选择回答服务</option>{providers.filter(provider => provider.kind === 'llm').map(provider => <option key={provider.id} value={provider.id}>{provider.name}{provider.enabled ? '' : '（已停用）'}</option>)}</select></label></div>
    <div className={styles.twoColumns}><label className={styles.field}>供应商模型名称<input required maxLength={200} value={model.model} placeholder="例如 deepseek-chat" onChange={event => onChange({ ...model, model: event.target.value })} /></label><label className={styles.field}>最大输出 Token<input required type="number" min={1} max={8192} value={model.maxOutputTokens} onChange={event => onChange({ ...model, maxOutputTokens: Number(event.target.value) })} /></label></div>
    <label className={styles.check}><input type="checkbox" checked={model.enabled} onChange={event => onChange({ ...model, enabled: event.target.checked })} />向平台用户开放此模型</label>
    <div className={styles.sectionHeading}><button type="button" className={styles.secondaryButton} disabled={!model.enabled} onClick={actions.test}>测试此模型</button><button type="button" className={styles.linkDanger} onClick={actions.remove}>移除模型</button></div>
  </fieldset>
}
