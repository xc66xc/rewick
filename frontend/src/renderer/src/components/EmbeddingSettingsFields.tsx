import type { Settings, SettingsInput } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface EmbeddingSettingsFieldsProps { draft: SettingsInput; saved: Settings; onChange: (draft: SettingsInput) => void; onTest: () => void; disabled: boolean }
export default function EmbeddingSettingsFields({ draft, saved, onChange, onTest, disabled }: EmbeddingSettingsFieldsProps) {
  return <fieldset className={styles.settingsGroup}>
    <legend>资料检索向量模型<span>独立配置 Embeddings 接口</span></legend>
    <label className={styles.field}>向量 API 地址<input type="url" value={draft.embedding.baseUrl} required placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
      onChange={event => onChange({ ...draft, embedding: { ...draft.embedding, baseUrl: event.target.value } })} /></label>
    <p className={styles.fieldHint}>地址与 Key 的地域、业务空间需匹配；可使用控制台提供的兼容地址。</p>
    <div className={styles.fieldRow}><label className={styles.field}>向量模型<input value={draft.embedding.model} required placeholder="text-embedding-v4"
      onChange={event => onChange({ ...draft, embedding: { ...draft.embedding, model: event.target.value } })} /></label>
      <label className={styles.field}>向量维度<input type="number" min={64} max={4096} step={1} value={draft.embedding.dimensions} required
        onChange={event => onChange({ ...draft, embedding: { ...draft.embedding, dimensions: Number(event.target.value) } })} /></label></div>
    <label className={styles.field}><span>向量 API Key{saved.embedding.hasApiKey && <span className={styles.savedBadge}>已保存</span>}</span>
      <input type="password" autoComplete="new-password" value={draft.embedding.apiKey ?? ''} placeholder={saved.embedding.hasApiKey ? '留空保留已保存的 Key' : '填写向量服务专用 API Key'}
        onChange={event => onChange({ ...draft, embedding: { ...draft.embedding, apiKey: event.target.value } })} /></label>
    <p className={styles.fieldHint}>Key 独立保存，不会自动使用转写或回答模型的 Key。留空保留原值；修改地址、模型或维度后，请重建参考资料索引。</p>
    <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={onTest}>保存并测试向量模型</button>
  </fieldset>
}
