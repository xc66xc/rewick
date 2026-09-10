import type { ReferenceDocument } from '../../../shared/types'
import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface EnvironmentReferencePickerProps { documents: ReferenceDocument[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }
const statusLabels: Record<ReferenceDocument['status'], string> = { parsing: '解析中', pending: '等待建索引', indexing: '建索引中', ready: '可用', error: '处理失败' }
export default function EnvironmentReferencePicker({ documents, selected, disabled, onChange }: EnvironmentReferencePickerProps) {
  const missing = selected.filter(id => !documents.some(document => document.id === id))
  function handleToggle(id: string, checked: boolean) { onChange(checked ? [...selected, id] : selected.filter(value => value !== id)) }
  return <fieldset className={libraryStyles.referenceFieldset} disabled={disabled}><legend>环境参考资料</legend>
    <p className={libraryStyles.libraryInfo}>已选 {selected.length} / 30 份本地资料。百炼远程知识库开启时暂停平台资料检索，这些选择会保留。远程关闭后，仅在本地开关开启时检索已勾选、已启用且索引可用的资料；不勾选时不检索平台个人资料。</p>
    {documents.length ? <div className={libraryStyles.referenceChoices}>{documents.map(document => <label key={document.id} className={libraryStyles.referenceChoice}>
      <input type="checkbox" aria-label={`选择资料 ${document.name}`} checked={selected.includes(document.id)} disabled={!selected.includes(document.id) && selected.length >= 30} onChange={event => handleToggle(document.id, event.target.checked)} />
      <span className={libraryStyles.referenceChoiceText}><strong>{document.name}</strong><span>{document.kind === 'personal' ? '我的项目经历' : '技术参考'} · {statusLabels[document.status]}{!document.enabled ? ' · 全局未启用' : ''}</span></span>
    </label>)}</div> : <p className={libraryStyles.emptyState}>还没有平台参考资料。可以先保存环境，之后在个人背景导入资料，再回到这里勾选。</p>}
    {missing.length > 0 && <div className={libraryStyles.missingReference}><p>{missing.length} 份已选资料已被移除，不会参与回答。</p><button type="button" className={styles.textButton} onClick={() => onChange(selected.filter(id => !missing.includes(id)))}>清理失效资料</button></div>}
  </fieldset>
}
