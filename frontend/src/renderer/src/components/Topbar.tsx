import { ArrowsInSimple, ArrowsOutSimple, GearSix, PushPin } from '@phosphor-icons/react'
import IconButton from './IconButton'
import styles from '../styles/App.module.css'

interface TopbarProps { compact: boolean; pinned: boolean; onCompact: () => void; onPin: () => void; onSettings: () => void; desktop: boolean; account?: string; onLogout?: () => void; loggingOut?: boolean }
export default function Topbar({ compact, pinned, onCompact, onPin, onSettings, desktop, account, onLogout, loggingOut = false }: TopbarProps) {
  return <header className={styles.topbar}>
    <div className={styles.windowInset} />
    <span className={styles.windowTitle}>Interview Copilot <span className={styles.windowSubtitle}>/ 面试工作台</span></span>
    <div className={styles.topbarActions}>
      {account && <button type="button" className={styles.accountButton} title={account} disabled={loggingOut} onClick={onSettings} aria-label={`当前账号：${account}`}>{account}</button>}
      {onLogout && <button type="button" className={styles.textButton} disabled={loggingOut} onClick={onLogout}>{loggingOut ? '正在退出…' : '退出登录'}</button>}
      <IconButton label={pinned ? '取消置顶' : '窗口置顶'} active={pinned} aria-pressed={pinned} onClick={onPin} disabled={!desktop || loggingOut}><PushPin size={17} weight={pinned ? 'fill' : 'bold'} /></IconButton>
      <IconButton label={compact ? '恢复完整窗口' : '紧凑模式'} onClick={onCompact} disabled={loggingOut}>{compact ? <ArrowsOutSimple size={17} weight="bold" /> : <ArrowsInSimple size={17} weight="bold" />}</IconButton>
      <span className={styles.toolbarDivider} />
      <IconButton label="打开设置" onClick={onSettings} disabled={loggingOut}><GearSix size={18} weight="bold" /></IconButton>
    </div>
  </header>
}
