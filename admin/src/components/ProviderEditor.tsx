import type { Provider, Capability } from '../types'
import { capabilityNames } from '../types'
import styles from '../styles.module.css'
interface ProviderEditorProps { provider: Provider; original?: Provider; onChange: (provider: Provider) => void; onRemove: () => void; onSave: () => void; disabled: boolean }
export default function ProviderEditor({ provider, original, onChange, onRemove, onSave, disabled }: ProviderEditorProps) {
  const changedDestination = Boolean(original && (provider.url.trim() !== original.url || provider.kind !== original.kind))
  const requiresKey = changedDestination || (provider.enabled && !original?.hasApiKey)
  return <fieldset className={styles.editorCard} disabled={disabled} aria-label={`服务配置 ${provider.name || provider.id}`}><legend>{provider.name || '新服务'}<span className={styles.tableDetail}>{provider.id}</span></legend>
    <div className={styles.twoColumns}><label className={styles.field}>服务名称<input required maxLength={100} value={provider.name} onChange={event => onChange({ ...provider, name: event.target.value })} /></label><label className={styles.field}>服务类型<select value={provider.kind} onChange={event => onChange({ ...provider, kind: event.target.value as Capability })}>{Object.entries(capabilityNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <label className={styles.field}>请求地址<input required type="url" maxLength={2048} value={provider.url} placeholder={provider.kind === 'asr' ? 'wss://dashscope.aliyuncs.com/api-ws/v1/inference' : 'https://服务地址/完整接口路径'} onChange={event => onChange({ ...provider, url: event.target.value })} /></label>
    <p className={styles.hint}>{provider.kind === 'llm' ? '填写 Chat Completions 完整请求地址，包含 /chat/completions。' : provider.kind === 'asr' ? '填写支持 Fun-ASR 协议的 WebSocket 地址。' : provider.kind === 'embedding' ? '填写完整 Embeddings 地址，包含 /embeddings。' : '填写 Tavily 完整 Search 地址，包含 /search。'}远程服务使用 HTTPS / WSS。</p>
    <label className={styles.field}><span>API Key{original?.hasApiKey && <span className={styles.badge}>已保存</span>}</span><input type="password" autoComplete="new-password" required={requiresKey} value={provider.apiKey ?? ''} onChange={event => onChange({ ...provider, apiKey: event.target.value })} placeholder={requiresKey ? '请录入密钥' : '留空保留现有密钥'} /></label>
    {changedDestination && <p className={styles.warning}>请求地址或服务类型已更改，必须重新录入密钥。</p>}
    <div className={styles.sectionHeading}><label className={styles.check}><input type="checkbox" checked={provider.enabled} onChange={event => onChange({ ...provider, enabled: event.target.checked })} />启用服务</label><button type="button" className={styles.primaryButton} onClick={event => { const fields = event.currentTarget.closest('fieldset'); if (Array.from(fields?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select') ?? []).every(field => field.reportValidity())) onSave() }}>保存服务</button><button type="button" className={styles.linkDanger} onClick={onRemove}>移除服务</button></div>
  </fieldset>
}
