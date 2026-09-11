import type { ServiceKind, SettingsInput } from '../../../shared/types'
import { CheckRow } from './ui/check-row'
import { fieldClass, fieldRowClass, formNoteClass } from '../lib/form'

interface ServicePreferencesProps { kind: ServiceKind; draft: SettingsInput; onChange: (draft: SettingsInput) => void }
export default function ServicePreferences({ kind, draft, onChange }: ServicePreferencesProps) {
  if (kind === 'llm') return <div className={fieldRowClass}>
    <label className={fieldClass}>回答风格<select value={draft.answerStyle} onChange={event => onChange({ ...draft, answerStyle: event.target.value as SettingsInput['answerStyle'] })}><option value="concise">简短口语</option><option value="detailed">展开口语</option></select></label>
    <label className={fieldClass}>生成温度<input type="number" min={0} max={2} step={0.1} required value={draft.llm.temperature} onChange={event => onChange({ ...draft, llm: { ...draft.llm, temperature: Number(event.target.value) } })} /></label>
  </div>
  if (kind === 'asr') return <>
    <div className={fieldRowClass}><label className={fieldClass}>句末静音（毫秒）<input type="number" min={200} max={6000} step={100} required value={draft.asr.silenceMs} onChange={event => onChange({ ...draft, asr: { ...draft.asr, silenceMs: Number(event.target.value) } })} /></label>
      <label className={fieldClass}>自动回答等待（毫秒）<input type="number" min={1000} max={5000} step={100} required value={draft.autoAnswer.pauseMs} onChange={event => onChange({ ...draft, autoAnswer: { ...draft.autoAnswer, pauseMs: Number(event.target.value) } })} /></label></div>
    <CheckRow className="mb-4" checked={draft.autoAnswer.enabled} onChange={checked => onChange({ ...draft, autoAnswer: { ...draft.autoAnswer, enabled: checked } })} label="系统音频自动回答" />
    <p className={formNoteClass}>句末静音控制转写分句；自动回答等待面试官停顿后提交问题。更改转写服务后，重新开始转写生效。</p>
  </>
  return <><CheckRow className="mb-4" checked={draft.remoteKnowledge.enabled} onChange={checked => onChange({ ...draft, remoteKnowledge: { ...draft.remoteKnowledge, enabled: checked } })} label="启用远程知识库" />
    <p className={formNoteClass}>开启后只检索所选远程知识库，不检索平台个人资料。检索失败仍继续回答；简历和岗位 JD 始终作为参考。</p></>
}
