import { ArrowClockwise, BookOpen, ChatCircleDots, Database, Microphone } from '@phosphor-icons/react'
import layout from './UsagePage.module.css'
import { useState } from 'react'
import type { ApiClient } from '../api'
import { capabilityNames, dateTime, statusNames, usagePageSchema, type Capability } from '../types'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import Pagination from '../components/Pagination'
import styles from '../styles.module.css'
interface UsagePageProps { api: ApiClient }
export function usageDuration(start: string, finish: string | null): string {
  if (!finish) return '—'
  const elapsed = Date.parse(finish) - Date.parse(start)
  return Number.isFinite(elapsed) && elapsed >= 0 ? `${(elapsed / 1000).toFixed(2)} 秒` : '—'
}
const icons = { llm: ChatCircleDots, asr: Microphone, knowledge: BookOpen, embedding: Database, 'web-search': BookOpen }
const blankFilters = { userId: '', query: '', capability: '', status: '', model: '' }
export default function UsagePage({ api }: UsagePageProps) {
  const [more, setMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState(blankFilters)
  const [filters, setFilters] = useState(blankFilters)
  const [page, setPage] = useState(1)
  const { state, reload } = useResource(api, `/admin/usage?${new URLSearchParams({ ...filters, page: String(page), size: '20' })}`, usagePageSchema)
  const selected = state.kind === 'ready' ? state.data.items.find(item => item.id === selectedId) : undefined
  return <section className={styles.pageBody} aria-label="调用记录"><div className={styles.sectionHeading}><div><h2>调用记录</h2><p>查看模型请求与执行状态</p></div><button type="button" className={styles.secondaryButton} disabled={state.kind === 'loading'} onClick={reload}><ArrowClockwise size={18} />刷新</button></div><div className={layout.panel}>
    <form className={layout.toolbar} onSubmit={event => { event.preventDefault(); setFilters({ ...draft, query: draft.query.trim() }); setPage(1); setSelectedId(null); reload() }}>
      <label className={`${styles.field} ${layout.search}`}>邮箱或显示名称<input value={draft.query} maxLength={254} onChange={event => setDraft({ ...draft, query: event.target.value })} /></label>

      <label className={`${styles.field} ${layout.filter}`}>服务能力<select value={draft.capability} onChange={event => setDraft({ ...draft, capability: event.target.value })}><option value="">全部能力</option>{Object.entries(capabilityNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={`${styles.field} ${layout.filter}`}>请求状态<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="">全部状态</option>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" className={styles.secondaryButton} aria-expanded={more} onClick={() => setMore(value => !value)}>更多筛选{filters.userId || filters.model ? ' · 已应用' : ''}</button><button className={styles.primaryButton}>筛选记录</button>
      {more && <div className={layout.advanced}><label className={styles.field}>用户 ID<input value={draft.userId} maxLength={64} onChange={event => setDraft({ ...draft, userId: event.target.value })} /></label><label className={styles.field}>模型<input value={draft.model} maxLength={200} onChange={event => setDraft({ ...draft, model: event.target.value })} /></label></div>}
    </form>
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <>
      {state.data.items.length ? <div className={styles.tableScroll}><table className={layout.table}><caption className={styles.srOnly}>调用记录列表</caption><thead><tr><th>用户</th><th>服务能力</th><th>模型</th><th>状态</th><th>开始时间</th><th>耗时</th><th>操作</th></tr></thead><tbody>{state.data.items.map(item => {
        const Icon = icons[item.capability as Capability] || ChatCircleDots
        return <tr key={item.id} className={selectedId === item.id ? layout.selected : item.status === 'failed' ? layout.failed : undefined}><th scope="row"><div className={layout.user}><span className={styles.avatar} aria-hidden="true">{(item.displayName || '用户').slice(0, 1)}</span><div><strong>{item.displayName || '未命名用户'}</strong><span className={styles.tableDetail}>用户 ID {item.userId}</span></div></div></th><td><span className={layout.capability}><Icon size={20} />{capabilityNames[item.capability as Capability] ?? item.capability}</span></td><td className={styles.code}>{item.model || '—'}</td><td><span className={item.status === 'failed' ? layout.failure : item.status === 'started' ? layout.pending : item.status === 'complete' ? styles.enabledBadge : styles.mutedBadge}>{statusNames[item.status] ?? item.status}</span></td><td>{dateTime(item.createdAt)}</td><td>{usageDuration(item.createdAt, item.finishedAt)}</td><td><button type="button" className={styles.linkButton} aria-expanded={selectedId === item.id} onClick={() => setSelectedId(current => current === item.id ? null : item.id)}>查看详情</button></td></tr>
      })}</tbody></table></div> : <LoadState>没有匹配的调用记录。</LoadState>}
      {selected && <section className={layout.detail} data-failed={selected.status === 'failed'} aria-label="请求详情"><header className={layout.detailHeader}><h3>请求详情</h3><button type="button" className={styles.linkButton} onClick={() => setSelectedId(null)}>收起详情</button></header><dl className={layout.facts}>{[['请求 ID', selected.requestId], ['用户 ID', selected.userId], ['服务能力', capabilityNames[selected.capability as Capability] ?? selected.capability], ['模型', selected.model || '—'], ['状态', statusNames[selected.status] ?? selected.status], ['开始时间', dateTime(selected.createdAt)], ['结束时间', dateTime(selected.finishedAt)], ['耗时', usageDuration(selected.createdAt, selected.finishedAt)]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><p>不包含问题与回答正文。调用记录不等于费用账单。</p></section>}
      <Pagination page={state.data.page} size={state.data.size} total={state.data.total} onChange={value => { setPage(value); setSelectedId(null) }} />
    </>}
  </div></section>
}
