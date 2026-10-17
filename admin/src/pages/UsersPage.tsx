import MockWalletEditor from '../components/mock/MockWalletEditor'
import MockUserBalance from '../components/mock/MockUserBalance'
import { MagnifyingGlass, Plus } from '@phosphor-icons/react'
import UserMoreActions from '../components/UserMoreActions'
import { useRef, useState } from 'react'
import UserOverview, { clockDuration } from '../components/UserOverview'
import layout from './UsersPage.module.css'
import type { ApiClient } from '../api'
import { dateTime, usersSchema, type User } from '../types'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import Pagination from '../components/Pagination'
import UserEditor from '../components/UserEditor'
import WalletEditor from '../components/WalletEditor'
import WalletHistory from '../components/WalletHistory'
import { duration } from '../duration'
import UserSecurityDialog from '../components/UserSecurityDialog'
import styles from '../styles.module.css'
interface UsersPageProps { api: ApiClient }
type Selection = { kind: 'create' } | { kind: 'edit' | 'password' | 'revoke' | 'wallet' | 'history' | 'mock-wallet'; user: User }
export default function UsersPage({ api }: UsersPageProps) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [overviewId, setOverviewId] = useState<string | null>(null)
  const overviewTrigger = useRef<HTMLButtonElement | null>(null)
  const [mockRevision, setMockRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const { state, reload } = useResource(api, `/admin/users?${new URLSearchParams({ query, page: String(page), size: '20' })}`, usersSchema)
  const overviewUser = state.kind === 'ready' ? state.data.items.find(user => user.id === overviewId) : undefined
  function saved() { setSelection(null); setNotice('用户设置已更新。'); reload() }
  return <section className={styles.pageBody} aria-label="用户管理"><div className={styles.sectionHeading}><div><h2>用户管理</h2><p>管理账号与面试时长</p></div><button className={styles.primaryButton} onClick={() => setSelection({ kind: 'create' })}><Plus size={18} />创建用户</button></div>
    <div className={`${layout.workspace} ${overviewUser ? layout.withOverview : ''}`}><div className={`${styles.dataPanel} ${layout.list}`}><form className={styles.userToolbar} onSubmit={event => { event.preventDefault(); setOverviewId(null); setQuery(search.trim()); setPage(1); if (query === search.trim() && page === 1) reload() }}>
      <label className={styles.userSearch}><span className={styles.srOnly}>邮箱或显示名称</span><MagnifyingGlass size={19} aria-hidden="true" /><input placeholder="搜索邮箱或显示名称" maxLength={254} value={search} onChange={event => setSearch(event.target.value)} /></label><button className={styles.secondaryButton}>搜索</button><span className={styles.resultCount}>{state.kind === 'ready' ? `共 ${state.data.total} 位用户` : ''}</span>
    </form>{notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <>
      {state.data.items.length ? <div className={styles.tableScroll}><table><caption className={styles.srOnly}>平台用户列表</caption><thead><tr><th>用户</th><th>状态</th><th>辅助可用时长</th><th>模拟可用时长</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{state.data.items.map(user => <tr key={user.id} className={overviewId === user.id ? layout.selected : undefined}>
        <th scope="row"><button className={layout.identityButton} aria-label={`查看用户 ${user.displayName}`} aria-expanded={overviewId === user.id} onClick={event => { overviewTrigger.current = event.currentTarget; setOverviewId(user.id) }}><span className={styles.userIdentity}><span className={styles.avatar} aria-hidden="true">{Array.from(user.displayName)[0]?.toUpperCase()}</span><span><strong>{user.displayName}</strong><span className={styles.tableDetail}>{user.role === 'ADMIN' ? '管理员' : '普通用户'} · ID {user.id}</span></span></span></button></th><td><span className={user.enabled ? styles.enabledBadge : styles.mutedBadge}>{user.enabled ? '已启用' : '已停用'}</span></td><td className={styles.numeric} aria-label={duration(user.availableSeconds)}>{clockDuration(user.availableSeconds)}</td><td><MockUserBalance key={`${user.id}-${mockRevision}`} api={api} userId={user.id} /></td><td>{dateTime(user.createdAt)}</td><td><div className={styles.rowActions}>
          <button className={styles.linkButton} aria-label={`调整时长 ${user.displayName}`} onClick={() => setSelection({ kind: 'wallet', user })}>调整时长</button><button className={styles.linkButton} aria-label={`编辑 ${user.displayName}`} onClick={() => setSelection({ kind: 'edit', user })}>编辑</button><UserMoreActions name={user.displayName} onSelect={kind => setSelection({ kind, user })} />
        </div></td></tr>)}</tbody></table></div> : <LoadState>没有匹配的用户，可调整搜索或创建新用户。</LoadState>}
      <Pagination page={state.data.page} size={state.data.size} total={state.data.total} onChange={value => { setOverviewId(null); setPage(value) }} />
    </>}
    </div>{overviewUser && <UserOverview user={overviewUser} onAction={kind => setSelection({ kind, user: overviewUser })} onClose={() => { setOverviewId(null); overviewTrigger.current?.focus() }} />}</div>
    {selection?.kind === 'mock-wallet' && <MockWalletEditor api={api} user={selection.user} onClose={() => setSelection(null)} onSaved={() => { setSelection(null); setMockRevision(value => value + 1); setNotice('模拟余额已更新，辅助余额不变。') }} />}
    {selection?.kind === 'wallet' && <WalletEditor api={api} user={selection.user} onSaved={saved} onClose={() => setSelection(null)} />}
    {selection?.kind === 'history' && <WalletHistory api={api} user={selection.user} onClose={() => setSelection(null)} />}
    {selection?.kind === 'create' && <UserEditor api={api} onSaved={saved} onClose={() => setSelection(null)} />}
    {selection?.kind === 'edit' && <UserEditor api={api} user={selection.user} onSaved={saved} onClose={() => setSelection(null)} />}
    {(selection?.kind === 'password' || selection?.kind === 'revoke') && <UserSecurityDialog api={api} user={selection.user} mode={selection.kind} onSaved={saved} onClose={() => setSelection(null)} />}
  </section>
}
