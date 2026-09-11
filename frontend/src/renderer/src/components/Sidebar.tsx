import { Briefcase, ClockCounterClockwise, FileText, Plus, SquaresFour, Waveform } from '@phosphor-icons/react'
import { version } from '../../../../package.json'
import styles from '../styles/App.module.css'

export type Page = 'preparation' | 'workspace' | 'environments' | 'context' | 'history'
interface SidebarProps { page: Page; onChange: (page: Page) => void; onNew: () => void; canReset: boolean }
const navigation = [
  { page: 'preparation' as const, label: '准备面试', icon: Plus },
  { page: 'workspace' as const, label: '工作台', icon: SquaresFour },
  { page: 'environments' as const, label: '面试环境', icon: Briefcase },
  { page: 'context' as const, label: '个人背景', icon: FileText },
  { page: 'history' as const, label: '会话记录', icon: ClockCounterClockwise }
]
export default function Sidebar({ page, onChange, onNew, canReset }: SidebarProps) {
  return <aside className={styles.sidebar}>
    <div className={styles.brandMark} aria-label="Interview Copilot"><Waveform size={25} weight="bold" /></div>
    <nav className={styles.navigation} aria-label="主导航">
      {navigation.map(item => <button key={item.page} onClick={() => onChange(item.page)} aria-current={page === item.page ? 'page' : undefined}
        className={`${styles.navItem} ${page === item.page ? styles.navItemActive : ''}`}><item.icon size={21} weight={page === item.page ? 'fill' : 'bold'} /><span>{item.label}</span></button>)}
    </nav>
    <button className={styles.newSession} onClick={onNew} disabled={!canReset} title={canReset ? '保存当前内容并新建会话' : '停止转写和回答后可新建会话'}><Plus size={20} weight="bold" /><span>准备面试</span></button>
    <span className={styles.sidebarFoot}>V {version}</span>
  </aside>
}
