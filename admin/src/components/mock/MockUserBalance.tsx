import type { ApiClient } from '../../api'
import { useResource } from '../../hooks/useResource'
import { mockWalletSchema } from '../../mock-interviews'
import { duration } from '../../duration'
import styles from '../../styles.module.css'
export default function MockUserBalance({ api, userId }: { api: ApiClient; userId: string }) {
  const { state, reload } = useResource(api, `/admin/users/${encodeURIComponent(userId)}/mock-wallet`, mockWalletSchema)
  // The parent remounts this cell after an adjustment, avoiding stale independent balances.
  return <span>{state.kind === 'ready' ? duration(state.data.availableSeconds) : state.kind === 'loading' ? '加载中…' : <button type="button" className={styles.linkButton} title={state.error} onClick={reload}>读取失败，重试</button>}</span>
}
