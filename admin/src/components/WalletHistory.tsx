import { useState } from 'react'
import type { ApiClient } from '../api'
import { duration } from '../duration'
import { useResource } from '../hooks/useResource'
import { dateTime, type User } from '../types'
import { transactionsSchema } from '../wallet'
import LoadState from './LoadState'
import Modal from './Modal'
import Pagination from './Pagination'
import styles from '../styles.module.css'

interface WalletHistoryProps { api: ApiClient; user: User; onClose: () => void }
export default function WalletHistory({ api, user, onClose }: WalletHistoryProps) {
  const [page, setPage] = useState(1)
  const { state, reload } = useResource(api, `/admin/users/${encodeURIComponent(user.id)}/wallet/transactions?page=${page}&size=20`, transactionsSchema)
  return <Modal title={`时长记录 · ${user.displayName}`} onClose={onClose}><div className={styles.modalBody}>
    {state.kind === 'loading' ? <LoadState /> : state.kind === 'error' ? <LoadState error={state.error} onRetry={reload} /> : <>
      {state.data.items.length ? <div className={styles.tableScroll}><table><caption className={styles.srOnly}>时长变动记录</caption><thead><tr><th>变动</th><th>原因 / 操作者</th><th>时间</th></tr></thead><tbody>{state.data.items.map(item => <tr key={item.id}>
        <td>{item.deltaSeconds < 0 ? '−' : '+'}{duration(Math.abs(item.deltaSeconds))}<span className={styles.tableDetail}>{duration(item.beforeSeconds)} → {duration(item.afterSeconds)}</span></td>
        <td>{item.reason}<span className={styles.tableDetail}>{item.actorDisplayName ?? '系统计时'}{item.sessionId && ` · 面试 ${item.sessionId}`}</span></td><td>{dateTime(item.createdAt)}</td>
      </tr>)}</tbody></table></div> : <p>暂无时长变动记录。</p>}
      <Pagination page={state.data.page} size={state.data.size} total={state.data.total} onChange={setPage} />
    </>}
  </div></Modal>
}
