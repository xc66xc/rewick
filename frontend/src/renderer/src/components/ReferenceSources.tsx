import { Books, FileText } from '@phosphor-icons/react'
import type { ReferenceExcerpt, RetrievalContext } from '../../../shared/types'
import styles from '../styles/App.module.css'

interface ReferenceSourcesProps { retrieval: RetrievalContext }
function excerptLocation(excerpt: ReferenceExcerpt): string {
  if (excerpt.pageStart === undefined) return '文字片段'
  return excerpt.pageEnd !== undefined && excerpt.pageEnd !== excerpt.pageStart ? `第 ${excerpt.pageStart}–${excerpt.pageEnd} 页` : `第 ${excerpt.pageStart} 页`
}
export default function ReferenceSources({ retrieval }: ReferenceSourcesProps) {
  const remote = retrieval.remote
  if (retrieval.status === 'disabled' && !remote) return null
  const degraded = retrieval.status === 'degraded' || remote?.status === 'degraded'
  const remoteStatus = remote?.status === 'ready' ? '已检索' : remote?.status === 'empty' ? '未找到相关内容' : '检索暂不可用'
  const remoteNote = remote && <p className={`${styles.formNote} ${remote.status === 'degraded' ? styles.retrievalDegraded : ''}`}>百炼远程知识库 · {remoteStatus}<br />Agent ID：{remote.agentId}{remote.message && <><br />{remote.message}</>}</p>
  if (!retrieval.excerpts.length) return <div><p className={`${styles.retrievalNote} ${degraded ? styles.retrievalDegraded : ''}`}><Books size={14} aria-hidden="true" />{retrieval.message || (degraded ? '资料检索暂不可用，本次未提供参考片段。' : '本次未找到相关资料。')}</p>{remoteNote}</div>
  return <details className={styles.referenceSources}>
    <summary><Books size={15} aria-hidden="true" /><span>本次检索资料</span><span className={styles.sourceCount}>{retrieval.excerpts.length} 个片段</span>{remote && <span className={styles.sourceCount}>百炼：{remoteStatus}</span>}{degraded && <span className={styles.retrievalBadge}>{remote ? '部分检索降级' : '关键词匹配'}</span>}</summary>
    <p className={styles.sourceExplanation}>以下片段提供给了本次回答模型，不代表逐句引用或事实核验。复制回答时不会包含这些资料。</p>
    {remoteNote}
    {retrieval.message && <p className={styles.retrievalNote}>{retrieval.message}</p>}
    {degraded && !retrieval.message && <p className={styles.retrievalNote}>{remote ? '部分资料检索暂不可用，本次回答使用已取得的内容。' : '语义检索暂不可用，本次使用平台关键词匹配。'}</p>}
    <ol className={styles.sourceList}>{retrieval.excerpts.map(excerpt => <li key={`${excerpt.source ?? 'local'}:${excerpt.documentId}:${excerpt.revision}:${excerpt.chunkId}`} className={styles.sourceItem}>
      <header><FileText size={15} aria-hidden="true" /><strong>{excerpt.name}</strong><span>{excerptLocation(excerpt)}{excerpt.source !== 'bailian' && ` · 版本 ${excerpt.revision}`}</span></header>
      <span className={styles.sourceKind}>{excerpt.source === 'bailian' ? '百炼远程知识库 · 技术参考' : excerpt.kind === 'personal' ? '我的项目经历' : '技术参考'}</span><p>{excerpt.text}</p>
    </li>)}</ol>
  </details>
}
