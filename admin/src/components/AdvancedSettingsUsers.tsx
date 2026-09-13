import { useState } from 'react'
import type { ApiClient } from '../api'
import { useAdvancedSettingsUsers } from '../hooks/useAdvancedSettingsUsers'
import LoadState from './LoadState'
import styles from '../styles.module.css'

interface Props { api: ApiClient }
export default function AdvancedSettingsUsers({ api }: Props) {
  const [query, setQuery] = useState('')
  const users = useAdvancedSettingsUsers(api)
  const granted = users.state.kind === 'ready' ? users.state.data : []
  return <section aria-label="高级设置授权用户">
    <h3>高级设置授权用户</h3>
    <p className={styles.hint}>添加已有用户后，该用户可以调整回答模型、生成温度、语音转写服务和远程知识库。新用户默认不开放；移除权限不会删除其自定义配置。</p>
    {users.error && <p role="alert" className={styles.error}>{users.error}</p>}
    {users.notice && <p role="status" className={styles.notice}>{users.notice}</p>}
    <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); if (query.trim()) users.search(query) }}>
      <label className={styles.searchField}>搜索授权用户<input placeholder="输入邮箱或显示名称" maxLength={254} required value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button type="submit" disabled={users.searching || !query.trim()} className={styles.secondaryButton}>{users.searching ? '搜索中…' : '搜索已有用户'}</button>
    </form>
    {users.results && <section aria-label="用户搜索结果">
      {users.total > 20 && <p className={styles.hint}>仅显示前 20 位匹配用户，请输入更完整的邮箱或显示名称缩小范围。</p>}
      {users.results.length ? <ul>{users.results.map(user => <li key={user.id}>
        <strong>{user.displayName}</strong>{user.email && user.email !== user.displayName && <span> · {user.email}</span>}
        <button type="button" className={styles.linkButton} disabled={users.busy || users.state.kind !== 'ready' || granted.some(item => item.id === user.id)} aria-label={`添加权限 ${user.displayName}`} onClick={() => void users.change(user.id, true)}>{granted.some(item => item.id === user.id) ? '已授权' : '添加权限'}</button>
      </li>)}</ul> : <p>没有匹配的用户，请检查邮箱或显示名称。</p>}
    </section>}
    <h4>已授权用户</h4>
    {users.state.kind === 'loading' ? <LoadState /> : users.state.kind === 'error' ? <LoadState error={users.state.error} onRetry={users.reload} /> : granted.length ?
      <div className={styles.tableScroll}><table><caption className={styles.srOnly}>高级设置授权列表</caption><thead><tr><th>显示名称</th><th>邮箱</th><th>操作</th></tr></thead><tbody>{granted.map(user => <tr key={user.id}>
        <th scope="row">{user.displayName}</th><td>{user.email || '未绑定邮箱'}</td><td><button type="button" disabled={users.busy} className={styles.dangerButton} aria-label={`移除权限 ${user.displayName}`} onClick={() => void users.change(user.id, false)}>移除权限</button></td>
      </tr>)}</tbody></table></div> : <p>暂未添加授权用户。</p>}
  </section>
}
