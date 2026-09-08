import styles from '../styles.module.css'
interface LoadStateProps { error?: string; onRetry?: () => void; children?: string }
export default function LoadState({ error, onRetry, children = '正在加载…' }: LoadStateProps) {
  return <div className={styles.empty}><p role={error ? 'alert' : 'status'}>{error || children}</p>{error && onRetry && <button className={styles.secondaryButton} onClick={onRetry}>重新加载</button>}</div>
}
