import { useState } from 'react'
import { z } from 'zod'
import { type ApiClient, message } from '../api'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import DurationInput from '../components/DurationInput'
import Pagination from '../components/Pagination'
import { dateTime } from '../types'
import styles from '../styles.module.css'

const settingsSchema = z.object({ enabled: z.boolean(), rewardSeconds: z.number(), version: z.number() })
const recordsSchema = z.object({ page: z.number(), size: z.number(), total: z.number(), items: z.array(z.object({
  id: z.string(), inviterName: z.string(), inviterEmail: z.string().nullable(), inviteeName: z.string(), inviteeEmail: z.string().nullable(), code: z.string(), rewardSeconds: z.number(), createdAt: z.string(),
})) })
type Settings = z.infer<typeof settingsSchema>
function SettingsForm({ api, initial, reload }: { api: ApiClient; initial: Settings; reload: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError(''); setNotice('')
    try { setDraft(await api.request('/admin/invitation-settings', settingsSchema, { method: 'PUT', body: draft })); setNotice('邀请奖励配置已保存。') }
    catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}>
    <fieldset disabled={busy}><legend>邀请奖励规则</legend>
      <label><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />启用邀请奖励</label>
      <DurationInput label="每成功邀请一人奖励邀请人的时长" value={draft.rewardSeconds} onChange={rewardSeconds => setDraft({ ...draft, rewardSeconds })} />
      <p>注册时邀请码选填。仅邮箱验证并注册成功后发奖；修改规则不影响已获得的时长。</p>
      <button className={styles.primaryButton}>保存奖励配置</button>
      <button type="button" className={styles.secondaryButton} onClick={reload}>重新加载配置</button>
    </fieldset>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
  </form>
}
export default function InvitationsPage({ api }: { api: ApiClient }) {
  const settings = useResource(api, '/admin/invitation-settings', settingsSchema)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const records = useResource(api, `/admin/invitations?${new URLSearchParams({ search, page: String(page), size: '20' })}`, recordsSchema)
  return <section className={styles.pageBody} aria-label="邀请奖励">
    <h2>邀请奖励</h2>
    {settings.state.kind === 'ready' ? <SettingsForm api={api} initial={settings.state.data} reload={settings.reload} /> : <LoadState error={settings.state.kind === 'error' ? settings.state.error : undefined} onRetry={settings.reload} />}
    <h2>邀请记录</h2>
    <form className={styles.filters} onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(1); records.reload() }}>
      <label className={styles.field}>邮箱、显示名称或邀请码<input value={query} maxLength={254} onChange={event => setQuery(event.target.value)} /></label>
      <button className={styles.secondaryButton}>搜索</button>
    </form>
    {records.state.kind === 'ready' ? <>
      <div className={styles.tableScroll}><table><caption>已成功发放的邀请奖励</caption><thead><tr><th>邀请人</th><th>新用户</th><th>邀请码</th><th>奖励秒数</th><th>注册时间</th></tr></thead>
        <tbody>{records.state.data.items.map(item => <tr key={item.id}><td>{item.inviterName}<span className={styles.tableDetail}>{item.inviterEmail}</span></td><td>{item.inviteeName}<span className={styles.tableDetail}>{item.inviteeEmail}</span></td><td>{item.code}</td><td>{item.rewardSeconds}</td><td>{dateTime(item.createdAt)}</td></tr>)}</tbody>
      </table></div>
      <Pagination {...records.state.data} onChange={setPage} />
    </> : <LoadState error={records.state.kind === 'error' ? records.state.error : undefined} onRetry={records.reload} />}
  </section>
}
