import { Gift, MagnifyingGlass, PencilSimple, UserCheck } from '@phosphor-icons/react'
import Modal from '../components/Modal'
import { duration } from '../duration'
import layout from './InvitationsPage.module.css'
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
type Invitation = z.infer<typeof recordsSchema>['items'][number]
type Settings = z.infer<typeof settingsSchema>
function SettingsForm({ api, initial, onSaved, onClose, onReload }: { api: ApiClient; initial: Settings; onSaved: (value: Settings) => void; onClose: () => void; onReload: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)

  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try { onSaved(await api.request('/admin/invitation-settings', settingsSchema, { method: 'PUT', body: draft })) }
    catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return <Modal title="修改邀请奖励规则" busy={busy} onClose={onClose}><form className={styles.modalBody} onSubmit={event => { event.preventDefault(); void save() }}>
    <fieldset disabled={busy} className={styles.formStack}><legend>邀请奖励规则</legend>
      <label className={styles.check}><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />启用邀请奖励</label>
      <DurationInput label="每成功邀请一人奖励邀请人的时长" value={draft.rewardSeconds} onChange={rewardSeconds => setDraft({ ...draft, rewardSeconds })} />
      <p className={styles.hint}>注册时邀请码选填。仅邮箱验证并注册成功后发奖；修改规则不影响已获得的时长。</p>
      <div className={styles.actions}><button type="button" className={styles.linkButton} onClick={onReload}>重新加载配置</button><button type="button" className={styles.secondaryButton} onClick={onClose}>取消</button><button className={styles.primaryButton}>保存奖励配置</button></div>
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </form></Modal>
}
export default function InvitationsPage({ api }: { api: ApiClient }) {
  const settings = useResource(api, '/admin/invitation-settings', settingsSchema)
  const [editing, setEditing] = useState(false)
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<Invitation | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const records = useResource(api, `/admin/invitations?${new URLSearchParams({ search, page: String(page), size: '20' })}`, recordsSchema)
  const current = savedSettings ?? (settings.state.kind === 'ready' ? settings.state.data : null)
  return <section className={styles.pageBody} aria-label="邀请奖励">
    <div className={styles.sectionHeading}><div><h2>邀请奖励</h2><p>管理邀请规则与奖励发放</p></div></div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {current ? <section className={layout.summary} aria-label="当前奖励规则"><div className={layout.intro}><span className={layout.gift}><Gift size={34} /></span><div><h3>邀请奖励{current.enabled ? '已开启' : '已关闭'}</h3><p>通过邀请码邀请新用户注册，获得面试时长奖励。</p></div></div><div className={layout.reward}><span>每成功邀请一人，奖励邀请人</span><strong>{current.rewardSeconds % 60 === 0 ? `${current.rewardSeconds / 60} 分钟` : duration(current.rewardSeconds)}</strong></div><div className={layout.condition}><span>奖励触发条件</span><h4><UserCheck size={20} />邮箱验证并注册成功</h4><p>修改规则不影响已获得的时长。</p></div><button className={styles.secondaryButton} onClick={() => setEditing(true)}><PencilSimple size={18} />修改规则</button></section> : <LoadState error={settings.state.kind === 'error' ? settings.state.error : undefined} onRetry={settings.reload} />}
    <section className={layout.records} aria-label="邀请记录"><div className={layout.heading}><h3>邀请记录</h3><button className={styles.linkButton} onClick={records.reload}>刷新记录</button></div>
    <form className={layout.searchBar} onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(1); if (search === query.trim() && page === 1) records.reload() }}>
      <label className={layout.search}><span className={styles.srOnly}>邮箱、显示名称或邀请码</span><MagnifyingGlass size={18} /><input placeholder="搜索邮箱、名称或邀请码" value={query} maxLength={254} onChange={event => setQuery(event.target.value)} /></label><button className={styles.secondaryButton}>搜索</button>
    </form>
    {records.state.kind === 'ready' ? <>
      {records.state.data.items.length ? <div className={styles.tableScroll}><table className={layout.table}><caption className={styles.srOnly}>已成功发放的邀请奖励</caption><thead><tr><th>邀请人</th><th>新用户</th><th>邀请码</th><th>奖励时长</th><th>注册时间</th><th>发放状态</th><th>操作</th></tr></thead>
        <tbody>{records.state.data.items.map(item => <tr key={item.id}><td><div className={styles.userIdentity}><span className={styles.avatar} aria-hidden="true">{Array.from(item.inviterName)[0]}</span><div>{item.inviterName}<span className={styles.tableDetail}>{item.inviterEmail}</span></div></div></td><td><div className={styles.userIdentity}><span className={styles.avatar} aria-hidden="true">{Array.from(item.inviteeName)[0]}</span><div>{item.inviteeName}<span className={styles.tableDetail}>{item.inviteeEmail}</span></div></div></td><td>{item.code}</td><td className={styles.numeric}>{duration(item.rewardSeconds)}</td><td>{dateTime(item.createdAt)}</td><td><span className={styles.enabledBadge}>已发放</span></td><td><button className={styles.linkButton} onClick={() => setSelected(item)}>查看详情</button></td></tr>)}</tbody>
      </table></div> : <LoadState>暂无匹配的邀请记录。</LoadState>}
      <Pagination {...records.state.data} onChange={setPage} />
    </> : <LoadState error={records.state.kind === 'error' ? records.state.error : undefined} onRetry={records.reload} />}</section>
    {editing && current && <SettingsForm api={api} initial={current} onReload={() => { setEditing(false); setSavedSettings(null); settings.reload() }} onClose={() => setEditing(false)} onSaved={value => { setSavedSettings(value); setEditing(false); setNotice('邀请奖励配置已保存。') }} />}
    {selected && <Modal title="邀请奖励详情" onClose={() => setSelected(null)}><dl className={layout.details}><div><dt>邀请人</dt><dd>{selected.inviterName}<span>{selected.inviterEmail}</span></dd></div><div><dt>新用户</dt><dd>{selected.inviteeName}<span>{selected.inviteeEmail}</span></dd></div><div><dt>邀请码</dt><dd>{selected.code}</dd></div><div><dt>奖励时长</dt><dd>{duration(selected.rewardSeconds)}</dd></div><div><dt>注册时间</dt><dd>{dateTime(selected.createdAt)}</dd></div><div><dt>发放状态</dt><dd>已发放</dd></div></dl></Modal>}
  </section>
}
