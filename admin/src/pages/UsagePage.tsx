import { useState } from 'react'
import type { ApiClient } from '../api'
import { capabilityNames, dateTime, statusNames, usagePageSchema, type Capability } from '../types'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import Pagination from '../components/Pagination'
import styles from '../styles.module.css'
interface UsagePageProps { api: ApiClient }
const blankFilters = { userId: '', capability: '', status: '', model: '' }
export default function UsagePage({ api }: UsagePageProps) {
  const [draft, setDraft] = useState(blankFilters)
  const [filters, setFilters] = useState(blankFilters)
  const [page, setPage] = useState(1)
  const { state, reload } = useResource(api, `/admin/usage?${new URLSearchParams({ ...filters, page: String(page), size: '20' })}`, usagePageSchema)
  return <section className={styles.pageBody} aria-label="调用记录"><div className={styles.sectionHeading}><div><h2>请求与服务状态</h2><p>记录请求标识与执行结果，不包含问题和回答正文，也不等于费用账单。</p></div></div>
    <form className={styles.filters} onSubmit={event => { event.preventDefault(); setFilters({ ...draft }); setPage(1); reload() }}>
      <label className={styles.field}>用户 ID<input value={draft.userId} maxLength={64} onChange={event => setDraft({ ...draft, userId: event.target.value })} /></label>
      <label className={styles.field}>服务能力<select value={draft.capability} onChange={event => setDraft({ ...draft, capability: event.target.value })}><option value="">全部能力</option>{Object.entries(capabilityNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={styles.field}>请求状态<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="">全部状态</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={styles.field}>模型<input value={draft.model} maxLength={200} onChange={event => setDraft({ ...draft, model: event.target.value })} /></label><button className={styles.secondaryButton}>筛选记录</button>
    </form>
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <>
      {state.data.items.length ? <div className={styles.tableScroll}><table><caption className={styles.srOnly}>调用记录列表</caption><thead><tr><th>用户 / 请求</th><th>能力</th><th>模型</th><th>状态</th><th>开始时间</th><th>结束时间</th></tr></thead><tbody>{state.data.items.map(item => <tr key={item.id}><th scope="row">{item.username}<span className={styles.tableDetail}>用户 {item.userId} · {item.requestId}</span></th><td>{capabilityNames[item.capability as Capability] ?? item.capability}</td><td className={styles.code}>{item.model || '—'}</td><td>{statusNames[item.status] ?? item.status}</td><td>{dateTime(item.createdAt)}</td><td>{dateTime(item.finishedAt)}</td></tr>)}</tbody></table></div> : <LoadState>没有匹配的调用记录。</LoadState>}
      <Pagination page={state.data.page} size={state.data.size} total={state.data.total} onChange={setPage} />
    </>}
  </section>
}
