import { useState } from 'react'
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
type Selection = { kind: 'create' } | { kind: 'edit' | 'password' | 'revoke' | 'wallet' | 'history'; user: User }
export default function UsersPage({ api }: UsersPageProps) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [notice, setNotice] = useState('')
  const { state, reload } = useResource(api, `/admin/users?${new URLSearchParams({ query, page: String(page), size: '20' })}`, usersSchema)
  function saved() { setSelection(null); setNotice('用户设置已更新。'); reload() }
  return <section className={styles.pageBody} aria-label="用户管理"><div className={styles.sectionHeading}><div><h2>平台用户</h2><p>管理账号状态与可用面试时长。</p></div><button className={styles.primaryButton} onClick={() => setSelection({ kind: 'create' })}>创建用户</button></div>
    <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); if (query === search.trim() && page === 1) reload() }}>
      <label className={styles.searchField}>邮箱或显示名称<input placeholder="输入邮箱或显示名称" maxLength={254} value={search} onChange={event => setSearch(event.target.value)} /></label><button className={styles.secondaryButton}>搜索</button>
    </form>{notice && <p className={styles.notice} role="status">{notice}</p>}
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <>
      {state.data.items.length ? <div className={styles.tableScroll}><table><caption className={styles.srOnly}>平台用户列表</caption><thead><tr><th>用户</th><th>状态</th><th>可用时长</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{state.data.items.map(user => <tr key={user.id}>
        <th scope="row"><strong>{user.displayName}</strong><span className={styles.tableDetail}>{user.role === 'ADMIN' ? '管理员' : '普通用户'} · ID {user.id}</span></th><td><span className={user.enabled ? styles.badge : styles.mutedBadge}>{user.enabled ? '已启用' : '已停用'}</span></td><td className={styles.numeric}>{duration(user.availableSeconds)}</td><td>{dateTime(user.createdAt)}</td><td><div className={styles.rowActions}>
          <button className={styles.linkButton} aria-label={`调整时长 ${user.displayName}`} onClick={() => setSelection({ kind: 'wallet', user })}>调整时长</button><button className={styles.linkButton} aria-label={`时长记录 ${user.displayName}`} onClick={() => setSelection({ kind: 'history', user })}>时长记录</button><button className={styles.linkButton} aria-label={`编辑 ${user.displayName}`} onClick={() => setSelection({ kind: 'edit', user })}>编辑</button><button className={styles.linkButton} aria-label={`重置密码 ${user.displayName}`} onClick={() => setSelection({ kind: 'password', user })}>重置密码</button><button className={styles.linkButton} aria-label={`撤销登录 ${user.displayName}`} onClick={() => setSelection({ kind: 'revoke', user })}>撤销登录</button>
        </div></td></tr>)}</tbody></table></div> : <LoadState>没有匹配的用户，可调整搜索或创建新用户。</LoadState>}
      <Pagination page={state.data.page} size={state.data.size} total={state.data.total} onChange={setPage} />
    </>}
    {selection?.kind === 'wallet' && <WalletEditor api={api} user={selection.user} onSaved={saved} onClose={() => setSelection(null)} />}
    {selection?.kind === 'history' && <WalletHistory api={api} user={selection.user} onClose={() => setSelection(null)} />}
    {selection?.kind === 'create' && <UserEditor api={api} onSaved={saved} onClose={() => setSelection(null)} />}
    {selection?.kind === 'edit' && <UserEditor api={api} user={selection.user} onSaved={saved} onClose={() => setSelection(null)} />}
    {(selection?.kind === 'password' || selection?.kind === 'revoke') && <UserSecurityDialog api={api} user={selection.user} mode={selection.kind} onSaved={saved} onClose={() => setSelection(null)} />}
  </section>
}
