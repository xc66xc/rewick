import { useState } from 'react'
import { traceDetailSchema, tracesSchema, outcomeNames, operationTypeNames, type Trace } from '../../operations'
import { dateTime } from '../../types'
import { type ApiClient, message } from '../../api'
import { useOperationsResource } from '../../hooks/useOperationsResource'
import LoadState from '../LoadState'
import Pagination from '../Pagination'
import OperationTimeline from './OperationTimeline'
import styles from '../../styles.module.css'
import layout from '../../pages/OperationsPage.module.css'
export interface TraceSelection { operationId?: string; userId: string }
interface SelectedTrace { operationId: string; userId: string }
interface Props { api: ApiClient; hours: number; active: boolean; initial?: TraceSelection }
const blank = { userId: '', sessionId: '', model: '', appVersion: '' }
function TraceDetailPanel({ api, selection, active }: { api: ApiClient; selection: SelectedTrace; active: boolean }) {
  const { state, reload } = useOperationsResource(api, `/admin/operations/traces/${encodeURIComponent(selection.operationId)}?${new URLSearchParams({ userId: selection.userId })}`, traceDetailSchema, active)
  return state.kind === 'ready' ? <OperationTimeline data={state.data} /> : <LoadState error={state.kind === 'error' ? state.error : undefined} onRetry={reload} />
}
export default function OperationsTraces({ api, hours, active, initial }: Props) {
  const [draft, setDraft] = useState({ ...blank, userId: initial?.userId ?? '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<SelectedTrace | null>(initial?.operationId ? { operationId: initial.operationId, userId: initial.userId } : null)
  const [lookup, setLookup] = useState(initial?.operationId ?? '')
  const [error, setError] = useState('')
  const { state, reload } = useOperationsResource(api, `/admin/operations/traces?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim())), hours: String(Math.min(hours, 168)), page: String(page), size: '20' })}`, tracesSchema, active)
  function select(trace: Trace) { setSelected({ operationId: trace.operationId, userId: trace.userId }); setLookup(trace.operationId) }
  return <><section className={layout.panel}><h3>操作链路</h3><p className={styles.hint}>全量明细保留 7 天。客户端报告无法用于验证真实回答质量或计费；未上报的阶段不补造。会话同步失败不等于回答模型调用失败。</p><form className={layout.toolbar} onSubmit={event => { event.preventDefault(); setFilters(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as typeof draft); setPage(1); setSelected(null); reload() }}>
    {([['userId', '用户 ID'], ['sessionId', '会话 ID'], ['model', '模型'], ['appVersion', '客户端版本']] as const).map(([key, label]) => <label className={`${styles.field} ${layout.filter}`} key={key}>{label}<input pattern={key === 'userId' ? '[1-9][0-9]*' : undefined} maxLength={key === 'model' ? 200 : key === 'appVersion' ? 32 : 128} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}<button className={styles.primaryButton}>筛选链路</button></form>
    <form className={layout.toolbar} onSubmit={event => { event.preventDefault(); if (!/^[1-9]\d*$/.test(draft.userId.trim())) { setError('查看指定操作需要有效用户 ID，请先填写筛选栏的用户 ID。'); return } try { const parsed = traceDetailSchema.shape.operationId.parse(lookup.trim()); setSelected({ operationId: parsed, userId: draft.userId.trim() }); setError('') } catch (reason) { setError(`请输入有效的操作 UUID。${message(reason).includes('登录') ? message(reason) : ''}`) } }}><label className={`${styles.field} ${layout.filter}`}>操作 ID<input required maxLength={36} value={lookup} onChange={event => setLookup(event.target.value)} /></label><button className={styles.secondaryButton}>查看指定操作</button></form>{error && <p role="alert" className={styles.error}>{error}</p>}</section>
    {state.kind !== 'ready' ? <LoadState error={state.kind === 'error' ? state.error : undefined} onRetry={reload} /> : <><div className={styles.tableScroll}><table className={layout.wideTable}><caption>最近操作 · 最多 7 天</caption><thead><tr><th>操作 / 用户</th><th>操作类型</th><th>模型 / 客户端版本</th><th>开始时间</th><th>结果</th><th>事件</th><th>来源</th><th>操作</th></tr></thead><tbody>{state.data.items.map(trace => <tr key={`${trace.userId}:${trace.operationId}`}><th scope="row"><span className={styles.code}>{trace.operationId}</span><span className={styles.tableDetail}>用户 {trace.userId}{trace.sessionId ? ` · 会话 ${trace.sessionId}` : ''}</span></th><td>{operationTypeNames[trace.operationType]}</td><td>{trace.operationType === 'session-sync' ? '不涉及模型' : trace.model || '未上报'}<span className={styles.tableDetail}>{trace.appVersion ? `客户端 ${trace.appVersion}` : '客户端版本未上报'}</span></td><td>{dateTime(trace.startedAt)}</td><td>{outcomeNames[trace.outcome]}</td><td>{trace.eventCount}</td><td>{trace.clientReported ? '含客户端报告' : '仅后端'}</td><td><button className={styles.linkButton} onClick={() => select(trace)}>查看链路</button></td></tr>)}</tbody></table>{!state.data.items.length && <p className={styles.empty}>暂无匹配链路，不代表没有面试。</p>}</div><Pagination page={state.data.page} total={state.data.total} size={state.data.size} onChange={setPage} /></>}
    {selected && <><button className={styles.linkButton} onClick={() => setSelected(null)}>收起操作链路</button><TraceDetailPanel api={api} selection={selected} active={active} /></>}
  </>
}
