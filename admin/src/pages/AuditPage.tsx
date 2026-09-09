import { useState } from 'react'
import type { ApiClient } from '../api'
import { auditPageSchema, dateTime } from '../types'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import Pagination from '../components/Pagination'
import styles from '../styles.module.css'
interface AuditPageProps { api: ApiClient }
export default function AuditPage({ api }: AuditPageProps) {
  const [page, setPage] = useState(1)
  const { state, reload } = useResource(api, `/admin/audit?page=${page}&size=20`, auditPageSchema)
  return <section className={styles.pageBody} aria-label="操作日志"><div className={styles.sectionHeading}><div><h2>管理操作留痕</h2><p>查看操作者、动作与目标，不记录密码、密钥或敏感请求内容。</p></div><button className={styles.secondaryButton} onClick={reload}>刷新日志</button></div>
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <>
      {state.data.items.length ? <div className={styles.tableScroll}><table><caption className={styles.srOnly}>操作日志列表</caption><thead><tr><th>操作者</th><th>动作</th><th>目标</th><th>时间</th></tr></thead><tbody>{state.data.items.map(item => <tr key={item.id}><th scope="row">{item.actorDisplayName}<span className={styles.tableDetail}>ID {item.actorId}</span></th><td>{item.action}</td><td className={styles.code}>{item.target}</td><td>{dateTime(item.createdAt)}</td></tr>)}</tbody></table></div> : <LoadState>尚无管理操作记录。</LoadState>}
      <Pagination page={state.data.page} size={state.data.size} total={state.data.total} onChange={setPage} />
    </>}
  </section>
}
