import { useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'
import { groups, type PageId } from '../navigation'
import styles from '../styles.module.css'
interface Props { page: PageId; collapsed: boolean; mobileOpen: boolean; name: string; onNavigate: (page: PageId) => void; onClose: () => void }
export default function AdminNavigation({ page, collapsed, mobileOpen, name, onNavigate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.activeElement
    const element = dialog.current
    element?.showModal()
    const query = window.matchMedia?.('(min-width: 821px)')
    const resize = () => { if (query?.matches) onClose() }
    query?.addEventListener('change', resize)
    return () => { query?.removeEventListener('change', resize); element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [mobileOpen, onClose])
  function links(mobile: boolean) {
    return <nav className={styles.navigation} aria-label={mobile ? '移动管理导航' : '管理导航'}>{groups.map(group => <div key={group.name} className={styles.navGroup}><p>{group.name}</p>{group.pages.map(item => <button type="button" key={item.id} className={page === item.id ? styles.navActive : styles.navButton} aria-label={item.name} title={collapsed && !mobile ? item.name : undefined} aria-current={page === item.id ? 'page' : undefined} onClick={() => { onNavigate(item.id); if (mobile) onClose() }}><item.icon size={19} weight={page === item.id ? 'duotone' : 'regular'} /><span className={styles.navLabel}>{item.name}</span></button>)}</div>)}</nav>
  }
  return <><aside className={styles.sidebar} aria-label="侧边栏"><div className={styles.brand}><img className={styles.brandMark} src="/rewick-icon.png" alt="" width={34} height={34} /><div className={styles.brandText}>掌灯 Rewick<small>平台管理</small></div></div>{links(false)}<div className={styles.sidebarFooter}><span className={styles.avatar} aria-hidden="true">{name.slice(0, 1)}</span><div className={styles.footerText}><strong>{name}</strong><small>管理员工作区</small></div></div></aside>
    {mobileOpen && <dialog ref={dialog} className={styles.mobileNavigation} aria-label="管理菜单" onCancel={event => { event.preventDefault(); onClose() }}><div className={styles.mobileNavHeading}><strong>掌灯 Rewick</strong><button className={styles.iconButton} onClick={onClose} aria-label="关闭管理菜单"><X size={20} /></button></div>{links(true)}</dialog>}
  </>
}
