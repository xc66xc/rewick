import { Clock, ListNumbers } from '@phosphor-icons/react'
import { money, type TimePackage } from '../payments'
import { duration } from '../duration'
import styles from '../styles.module.css'
import layout from '../pages/PackagesPage.module.css'
interface PackageCardProps { item: TimePackage; selected: boolean; onSelect: () => void; onEdit: () => void; onToggle: () => void }
export function packageDuration(seconds: number) {
  return seconds % 3600 === 0 ? `${seconds / 3600} 小时` : duration(seconds)
}
export default function PackageCard({ item, selected, onSelect, onEdit, onToggle }: PackageCardProps) {
  return <article className={`${layout.card} ${selected ? layout.selected : ''}`} aria-label={item.name}>
    <header className={layout.cardHeader}><button className={layout.name} onClick={onSelect} aria-pressed={selected}>{item.name}</button><span className={item.enabled ? styles.enabledBadge : styles.mutedBadge}>{item.enabled ? '已上架' : '已下架'}</span></header>
    <div className={layout.price}>{money(item.priceCents)}{item.priceCents !== item.originalPriceCents && <del>{money(item.originalPriceCents)}</del>}</div>
    <div className={layout.duration}><Clock size={20} /><div><span>面试时长</span><strong>{packageDuration(item.durationSeconds)}</strong></div></div>
    <p className={layout.description}>{item.description || '暂无套餐说明'}</p>
    <div className={layout.meta}><span><ListNumbers size={16} />排序 {item.sortOrder}</span><span><Clock size={16} />长期有效</span></div>
    <div className={layout.cardActions}><button className={styles.secondaryButton} onClick={onEdit} aria-label={`编辑套餐 ${item.name}`}>编辑套餐</button><button className={styles.secondaryButton} onClick={onToggle} aria-label={`${item.enabled ? '下架' : '上架'} ${item.name}`}>{item.enabled ? '下架' : '上架'}</button></div>
  </article>
}
