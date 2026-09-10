import type { ServiceKind, SettingsInput } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface ServicePreferencesProps { kind: ServiceKind; draft: SettingsInput; onChange: (draft: SettingsInput) => void }
export default function ServicePreferences({ kind, draft, onChange }: ServicePreferencesProps) {
  if (kind === 'llm') return <div className={styles.fieldRow}>
    <label className={styles.field}>回答风格<select value={draft.answerStyle} onChange={event => onChange({ ...draft, answerStyle: event.target.value as SettingsInput['answerStyle'] })}><option value="concise">简短口语</option><option value="detailed">展开口语</option></select></label>
    <label className={styles.field}>生成温度<input type="number" min={0} max={2} step={0.1} required value={draft.llm.temperature} onChange={event => onChange({ ...draft, llm: { ...draft.llm, temperature: Number(event.target.value) } })} /></label>
  </div>
  if (kind === 'asr') return <>
    <div className={styles.fieldRow}><label className={styles.field}>句末静音（毫秒）<input type="number" min={200} max={6000} step={100} required value={draft.asr.silenceMs} onChange={event => onChange({ ...draft, asr: { ...draft.asr, silenceMs: Number(event.target.value) } })} /></label>
      <label className={styles.field}>自动回答等待（毫秒）<input type="number" min={1000} max={5000} step={100} required value={draft.autoAnswer.pauseMs} onChange={event => onChange({ ...draft, autoAnswer: { ...draft.autoAnswer, pauseMs: Number(event.target.value) } })} /></label></div>
    <label className={styles.referenceGlobalToggle}><input type="checkbox" checked={draft.autoAnswer.enabled} onChange={event => onChange({ ...draft, autoAnswer: { ...draft.autoAnswer, enabled: event.target.checked } })} />系统音频自动回答</label>
    <p className={styles.formNote}>句末静音控制转写分句；自动回答等待面试官停顿后提交问题。更改转写服务后，重新开始转写生效。</p>
  </>
  return <><label className={styles.referenceGlobalToggle}><input type="checkbox" checked={draft.remoteKnowledge.enabled} onChange={event => onChange({ ...draft, remoteKnowledge: { ...draft.remoteKnowledge, enabled: event.target.checked } })} />启用远程知识库</label>
    <p className={styles.formNote}>开启后只检索所选远程知识库，不检索平台个人资料。检索失败仍继续回答；简历和岗位 JD 始终作为参考。</p></>
}
