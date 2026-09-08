import type { InterviewEnvironment, InterviewLibrary, ReferenceDocument } from '../../../shared/types'
import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface EnvironmentListActions { onEdit: (environment: InterviewEnvironment) => void; onActivate: (id: string) => void; onRemove: (id: string) => void }
interface InterviewEnvironmentListProps { library: InterviewLibrary; references: ReferenceDocument[]; selectedId?: string; busy: boolean; isSessionActive: boolean; actions: EnvironmentListActions }
export default function InterviewEnvironmentList({ library, references, selectedId, busy, isSessionActive, actions }: InterviewEnvironmentListProps) {
  return <ul className={libraryStyles.environmentList} aria-label="已保存面试环境">{library.environments.map(environment => {
    const current = environment.id === library.activeEnvironmentId
    const resume = library.resumes.find(record => record.id === environment.resumeId)
    const target = library.targets.find(record => record.id === environment.targetId)
    return <li key={environment.id}><article aria-label={`面试环境 ${environment.name}`} className={`${libraryStyles.environmentCard} ${selectedId === environment.id ? libraryStyles.environmentCardSelected : ''}`}>
      <header className={libraryStyles.environmentCardHeader}><h2>{environment.name}</h2>{current && <span className={libraryStyles.currentBadge}>当前环境</span>}</header>
      <dl className={libraryStyles.environmentMeta}><dt>简历</dt><dd>{resume?.name ?? (environment.resumeId ? '所选简历已失效' : '未选择')}</dd>
        <dt>岗位</dt><dd>{target?.name ?? (environment.targetId ? '所选岗位已失效' : '未选择')}</dd><dt>资料</dt><dd>{environment.referenceIds.length ? environment.referenceIds.map(id => references.find(document => document.id === id)?.name ?? '已失效资料').join('、') : '未选择'}</dd></dl>
      <div className={libraryStyles.actions}><button className={styles.secondaryButton} aria-label={`进入面试 ${environment.name}`} disabled={busy || isSessionActive || current} onClick={() => actions.onActivate(environment.id)}>进入面试</button>
        <button className={styles.textButton} aria-label={`编辑环境 ${environment.name}`} disabled={busy || (current && isSessionActive)} onClick={() => actions.onEdit(environment)}>编辑</button>
        <button className={styles.textButton} aria-label={`删除环境 ${environment.name}`} disabled={busy || current} onClick={() => actions.onRemove(environment.id)}>删除</button></div>
    </article></li>
  })}</ul>
}
