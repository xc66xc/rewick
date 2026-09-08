import type { Settings, SettingsInput } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface ModelSettingsFieldsProps { draft: SettingsInput; saved: Settings; onChange: (draft: SettingsInput) => void }
export default function ModelSettingsFields({ draft, saved, onChange }: ModelSettingsFieldsProps) {
  return <fieldset className={styles.settingsGroup}>
    <legend>回答模型<span>兼容 OpenAI Chat Completions</span></legend>
    <label className={styles.field}>回答 API 地址<input type="url" value={draft.llm.baseUrl} placeholder="https://api.deepseek.com/v1"
      onChange={event => onChange({ ...draft, llm: { ...draft.llm, baseUrl: event.target.value } })} required /></label>
    <p className={styles.fieldHint}>填写基础地址或完整的 /chat/completions 地址。本地模型可使用 localhost。</p>
    <div className={styles.fieldRow}>
      <label className={styles.field}>回答模型<input value={draft.llm.model} placeholder="模型名称"
        onChange={event => onChange({ ...draft, llm: { ...draft.llm, model: event.target.value } })} required /></label>
      <label className={styles.field}>回答风格<select value={draft.answerStyle} onChange={event => onChange({ ...draft, answerStyle: event.target.value as SettingsInput['answerStyle'] })}>
        <option value="concise">简短口语</option><option value="detailed">展开口语</option></select></label>
    </div>
    <label className={styles.field}><span>回答 API Key{saved.llm.hasApiKey && <span className={styles.savedBadge}>已保存</span>}</span>
      <input type="password" autoComplete="new-password" value={draft.llm.apiKey ?? ''} placeholder={saved.llm.hasApiKey ? '留空保留已保存的 Key' : '输入你的 API Key'}
        onChange={event => onChange({ ...draft, llm: { ...draft.llm, apiKey: event.target.value || undefined } })} /></label>
    {saved.llm.hasApiKey && <button type="button" className={styles.secondaryButton} disabled={draft.llm.apiKey === ''}
      onClick={() => onChange({ ...draft, llm: { ...draft.llm, apiKey: '' } })}>{draft.llm.apiKey === '' ? '保存后清除回答 Key' : '清除自带回答 Key'}</button>}
    {draft.platform?.enabled && <p className={styles.formNote}>未配置自带 Key 时使用平台提供的回答模型；本地模型仍使用上面的本机地址。清除 Key 后请保存设置。</p>}
    <label className={styles.field}>生成温度<input type="number" min={0} max={2} step={0.1} value={draft.llm.temperature}
      onChange={event => onChange({ ...draft, llm: { ...draft.llm, temperature: Number(event.target.value) } })} /></label>
  </fieldset>
}
