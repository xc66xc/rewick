import styles from '../styles.module.css'
interface PaginationProps { page: number; size: number; total: number; onChange: (page: number) => void }
export default function Pagination({ page, size, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / size))
  const visible = [...new Set([1, ...Array.from({ length: 3 }, (_, i) => page + i - 1), pages])].filter(value => value >= 1 && value <= pages).sort((a, b) => a - b)
  return <nav className={styles.pagination} aria-label="列表分页"><span>共 {total} 条 · 每页 {size} 条 · 第 {page} / {pages} 页</span><div className={styles.actions}>
    <button className={styles.secondaryButton} disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>{visible.map((value, index) => <span className={styles.pageNumberGroup} key={value}>{index > 0 && value - visible[index - 1] > 1 && <span aria-hidden="true">…</span>}<button className={value === page ? styles.primaryButton : styles.secondaryButton} aria-label={`第 ${value} 页`} aria-current={value === page ? 'page' : undefined} onClick={() => onChange(value)}>{value}</button></span>)}<button className={styles.secondaryButton} disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
  </div></nav>
}
