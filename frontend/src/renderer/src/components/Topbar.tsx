import { ArrowsInSimple, ArrowsOutSimple, GearSix, PushPin } from '@phosphor-icons/react'
import IconButton from './IconButton'
import styles from '../styles/App.module.css'

interface TopbarProps { compact: boolean; pinned: boolean; onCompact: () => void; onPin: () => void; onSettings: () => void; desktop: boolean }
export default function Topbar({ compact, pinned, onCompact, onPin, onSettings, desktop }: TopbarProps) {
  return <header className={styles.topbar}>
    <div className={styles.windowInset} />
    <span className={styles.windowTitle}>Interview Copilot <span className={styles.windowSubtitle}>/ 面试工作台</span></span>
    <div className={styles.topbarActions}>
      <IconButton label={pinned ? '取消置顶' : '窗口置顶'} active={pinned} aria-pressed={pinned} onClick={onPin} disabled={!desktop}><PushPin size={17} weight={pinned ? 'fill' : 'bold'} /></IconButton>
      <IconButton label={compact ? '恢复完整窗口' : '紧凑模式'} onClick={onCompact}>{compact ? <ArrowsOutSimple size={17} weight="bold" /> : <ArrowsInSimple size={17} weight="bold" />}</IconButton>
      <span className={styles.toolbarDivider} />
      <IconButton label="打开设置" onClick={onSettings}><GearSix size={18} weight="bold" /></IconButton>
    </div>
  </header>
}
