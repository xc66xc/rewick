import { dateTime } from '../../types'
import styles from '../../styles.module.css'
import layout from '../../pages/OperationsPage.module.css'
interface Props { updatedAt: string | null; stale: boolean }
export default function OperationsFreshness({ updatedAt, stale }: Props) {
  return <div className={layout.freshness}><span className={stale || !updatedAt ? styles.mutedBadge : styles.enabledBadge}>{!updatedAt ? '数据未知' : stale ? '数据已过期' : '数据已更新'}</span><span>更新于 {updatedAt ? dateTime(updatedAt) : '未知'}</span></div>
}
