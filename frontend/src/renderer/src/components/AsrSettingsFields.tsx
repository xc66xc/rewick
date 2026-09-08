import type { Settings, SettingsInput } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface AsrSettingsFieldsProps { draft: SettingsInput; saved: Settings; onChange: (draft: SettingsInput) => void }
export default function AsrSettingsFields({ draft, saved, onChange }: AsrSettingsFieldsProps) {
  return <fieldset className={styles.settingsGroup}>
    <legend>实时语音转写<span>阿里云百炼 · Fun-ASR</span></legend>
    <label className={styles.field}><span>转写 API Key{saved.asr.hasApiKey && <span className={styles.savedBadge}>已保存</span>}</span>
      <input type="password" autoComplete="new-password" value={draft.asr.apiKey ?? ''} placeholder={saved.asr.hasApiKey ? '留空保留已保存的 Key' : '输入阿里云百炼 API Key'}
        onChange={event => onChange({ ...draft, asr: { ...draft.asr, apiKey: event.target.value || undefined } })} /></label>
    {saved.asr.hasApiKey && <button type="button" className={styles.secondaryButton} disabled={draft.asr.apiKey === ''}
      onClick={() => onChange({ ...draft, asr: { ...draft.asr, apiKey: '' } })}>{draft.asr.apiKey === '' ? '保存后清除转写 Key' : '清除自带转写 Key'}</button>}
    {draft.platform?.enabled && <p className={styles.formNote}>未配置自带 Key 时使用平台转写服务，模型和连接地址由平台提供。清除 Key 后请保存设置。</p>}
    <div className={styles.fieldRow}>
      <label className={styles.field}>转写模型<input value={draft.asr.model} onChange={event => onChange({ ...draft, asr: { ...draft.asr, model: event.target.value } })} required /></label>
      <label className={styles.field}>句末静音（毫秒）<input type="number" min={200} max={6000} step={100} value={draft.asr.silenceMs}
        onChange={event => onChange({ ...draft, asr: { ...draft.asr, silenceMs: Number(event.target.value) } })} required /></label>
    </div>
    <details className={styles.advanced}><summary>高级连接设置</summary><label className={styles.field}>转写 WebSocket 地址<input value={draft.asr.url}
      onChange={event => onChange({ ...draft, asr: { ...draft.asr, url: event.target.value } })} required /></label></details>
    <p className={styles.fieldHint}>较短静音时间更快结束一句，较长时间更适合有停顿的表达。更改转写设置后，重新开始转写生效。</p>
  </fieldset>
}
