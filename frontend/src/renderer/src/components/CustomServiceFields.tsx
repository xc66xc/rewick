import type { CustomServiceInput, CustomServiceProfile } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface CustomServiceFieldsProps { draft: CustomServiceInput; saved?: CustomServiceProfile; onChange: (value: CustomServiceInput) => void }
export default function CustomServiceFields({ draft, saved, onChange }: CustomServiceFieldsProps) {
  const changedAddress = Boolean(saved && draft.url.trim() !== saved.url)
  return <>
    <label className={styles.field}>配置名称<input required maxLength={100} value={draft.name} onChange={event => onChange({ ...draft, name: event.target.value })} placeholder="例如：我的 DeepSeek" /></label>
    <label className={styles.field}>{draft.kind === 'asr' ? 'WebSocket 地址' : 'API 地址'}<input type="url" required value={draft.url} onChange={event => onChange({ ...draft, url: event.target.value })} /></label>
    <p className={styles.fieldHint}>{draft.kind === 'asr' ? '使用兼容 Fun-ASR 协议的 ws:// 或 wss:// 地址。' : draft.kind === 'knowledge' ? '填写完整的百炼知识检索请求地址。' : '兼容 OpenAI 接口，可填写基础地址或完整接口地址。本地模型支持 localhost。'}</p>
    {draft.kind === 'knowledge' ? <label className={styles.field}>Agent ID<input required value={draft.agentId ?? ''} onChange={event => onChange({ ...draft, agentId: event.target.value })} /></label>
      : <label className={styles.field}>模型名称<input required value={draft.model ?? ''} onChange={event => onChange({ ...draft, model: event.target.value })} /></label>}
    {draft.kind === 'embedding' && <label className={styles.field}>向量维度<input type="number" min={64} max={4096} step={1} required value={draft.dimensions ?? 1024} onChange={event => onChange({ ...draft, dimensions: Number(event.target.value) })} /></label>}
    <label className={styles.field}><span>API Key{saved?.hasApiKey && <span className={styles.savedBadge}>已保存</span>}</span><input type="password" autoComplete="new-password" value={draft.apiKey ?? ''}
      placeholder={saved?.hasApiKey && !changedAddress ? '留空保留已保存的 Key' : '填写此服务的 API Key；本地模型可留空'}
      onChange={event => onChange({ ...draft, apiKey: event.target.value || undefined })} /></label>
    {changedAddress && saved?.hasApiKey && <p className={styles.formNote}>连接地址已改变，请重新填写 API Key，原密钥不会发送到新地址。</p>}
  </>
}
