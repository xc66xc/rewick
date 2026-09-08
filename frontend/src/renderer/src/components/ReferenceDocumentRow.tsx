import { ArrowClockwise, Eye, FileText, Trash } from '@phosphor-icons/react'
import type { ReferenceDocument, ReferenceKind } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface ReferenceDocumentRowProps {
  document: ReferenceDocument
  busy: boolean
  removing: boolean
  onPreview: (document: ReferenceDocument) => void
  onUpdate: (id: string, patch: { enabled?: boolean; kind?: ReferenceKind }) => void
  onReindex: (id: string) => void
  onRemove: (id: string) => void
}
const statuses = { parsing: '解析中', pending: '等待建索引', indexing: '建索引中', ready: '可用', error: '处理失败' }
export default function ReferenceDocumentRow({ document, busy, removing, onPreview, onUpdate, onReindex, onRemove }: ReferenceDocumentRowProps) {
  const processing = document.status === 'parsing' || document.status === 'indexing'
  return <article className={styles.referenceRow} aria-label={`参考资料 ${document.name}`}>
    <div className={styles.referenceIdentity}><div className={styles.referenceFileIcon}><FileText size={22} weight="duotone" /></div><div className={styles.referenceName}>
      <h3>{document.name}</h3><p>{document.pageCount > 0 ? `${document.pageCount} 页 · ` : ''}{document.chunkCount} 个片段 · 版本 {document.revision}</p>
    </div><span className={`${styles.referenceStatus} ${document.status === 'ready' ? styles.referenceStatusReady : document.status === 'error' ? styles.referenceStatusError : ''}`} role="status">{statuses[document.status]}</span></div>
    <div className={styles.referenceOptions}>
      <label className={styles.referenceKind}>资料用途<select aria-label={`资料用途 ${document.name}`} value={document.kind} disabled={busy || removing} onChange={event => onUpdate(document.id, { kind: event.target.value as ReferenceKind })}>
        <option value="technical">技术参考</option><option value="personal">我的项目经历</option></select></label>
      <label className={styles.referenceEnable}><input type="checkbox" checked={document.enabled} disabled={busy || removing} aria-label={`启用资料 ${document.name}`} onChange={event => onUpdate(document.id, { enabled: event.target.checked })} />参与检索</label>
      <div className={styles.referenceActions}><button className={styles.textButton} disabled={busy || removing || document.status === 'parsing'} onClick={() => onPreview(document)} aria-label={`预览资料 ${document.name}`}><Eye size={16} />预览</button>
        <button className={styles.textButton} disabled={busy || removing || processing} onClick={() => onReindex(document.id)} aria-label={`重建索引 ${document.name}`}><ArrowClockwise size={15} />{document.status === 'error' ? '重试' : '重建索引'}</button>
        <button className={styles.textButton} disabled={removing} onClick={() => onRemove(document.id)} aria-label={`移除资料 ${document.name}`}><Trash size={15} />{removing ? '移除中…' : '移除'}</button></div>
    </div>
    {document.error && <p className={styles.inlineError}>{document.error}</p>}
  </article>
}
