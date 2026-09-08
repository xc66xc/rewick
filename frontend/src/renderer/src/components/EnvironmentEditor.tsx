import type { EnvironmentInput, InterviewLibrary, ReferenceDocument } from '../../../shared/types'
import EnvironmentReferencePicker from './EnvironmentReferencePicker'
import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface EnvironmentEditorProps {
  draft: EnvironmentInput; library: InterviewLibrary; references: ReferenceDocument[]; disabled: boolean; dirty: boolean
  onChange: (draft: EnvironmentInput) => void; onSave: () => void
}
export default function EnvironmentEditor({ draft, library, references, disabled, dirty, onChange, onSave }: EnvironmentEditorProps) {
  const missingResume = Boolean(draft.resumeId && !library.resumes.some(record => record.id === draft.resumeId))
  const missingTarget = Boolean(draft.targetId && !library.targets.some(record => record.id === draft.targetId))
  return <form onSubmit={event => { event.preventDefault(); onSave() }}><fieldset className={libraryStyles.editorFields} disabled={disabled}>
    <label className={styles.field}>环境名称<input value={draft.name} maxLength={100} required placeholder="例如：公司 A · 后端技术面" onChange={event => onChange({ ...draft, name: event.target.value })} /></label>
    <label className={styles.field}>环境简历<select value={draft.resumeId ?? ''} aria-invalid={missingResume} onChange={event => onChange({ ...draft, resumeId: event.target.value || null })}>
      <option value="">不选择简历</option>{missingResume && <option value={draft.resumeId ?? ''}>所选简历已失效，请重新选择</option>}{library.resumes.map(resume => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select></label>
    <label className={styles.field}>环境目标岗位<select value={draft.targetId ?? ''} aria-invalid={missingTarget} onChange={event => onChange({ ...draft, targetId: event.target.value || null })}>
      <option value="">不选择目标岗位</option>{missingTarget && <option value={draft.targetId ?? ''}>所选岗位已失效，请重新选择</option>}{library.targets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
    {(!draft.resumeId || !draft.targetId) && <p className={libraryStyles.libraryInfo}>{!draft.resumeId ? '未选择简历，不会提供个人经历。' : ''}{!draft.targetId ? '未选择岗位，不会提供公司和 JD。' : ''}不会使用其他环境的内容。</p>}
    {(missingResume || missingTarget) && <p className={styles.inlineError} role="alert">存在失效的简历或岗位，请重新选择或改为不选择后保存。</p>}
    <EnvironmentReferencePicker documents={references} selected={draft.referenceIds} disabled={disabled} onChange={referenceIds => onChange({ ...draft, referenceIds })} />
    <footer className={styles.contextFooter}><span>{dirty ? '尚未保存' : draft.id ? '已同步' : '新环境草稿'}</span><button type="submit" className={styles.primaryButton} disabled={disabled || !dirty || !draft.name.trim() || missingResume || missingTarget}>保存环境</button></footer>
  </fieldset></form>
}
