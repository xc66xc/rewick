import { List, SidebarSimple, Palette, SignOut } from '@phosphor-icons/react'
import type { RefObject } from 'react'
import { groups, pages, type PageId } from '../navigation'
import styles from '../styles.module.css'
interface Props { page: PageId; name: string; collapsed: boolean; heading: RefObject<HTMLHeadingElement | null>; onToggleSidebar: () => void; onMobileMenu: () => void; onAppearance: () => void; onLogout: () => void }
export default function WorkspaceHeader({ page, name, collapsed, heading, onToggleSidebar, onMobileMenu, onAppearance, onLogout }: Props) {
  const current = pages.find(item => item.id === page)?.name
  return <header className={styles.topbar}><div className={styles.topbarStart}>
    <button className={`${styles.iconButton} ${styles.desktopMenuButton}`} aria-label={collapsed ? '展开导航' : '折叠导航'} aria-expanded={!collapsed} onClick={onToggleSidebar}><SidebarSimple size={20} /></button>
    <button className={`${styles.iconButton} ${styles.mobileMenuButton}`} aria-label="打开管理菜单" onClick={onMobileMenu}><List size={20} /></button>
    <p className={styles.breadcrumb}><span>{groups.find(group => group.pages.some(item => item.id === page))?.name}</span><span aria-hidden="true">/</span><strong>{current}</strong></p><h1 className={styles.srOnly} ref={heading} tabIndex={-1}>{current}</h1>
  </div><div className={styles.account}><button className={styles.iconButton} onClick={onAppearance} aria-label="外观设置" title="外观设置"><Palette size={20} /></button><div className={styles.accountIdentity}><span className={styles.avatar} aria-hidden="true">{name.slice(0, 1)}</span><div><strong>{name}</strong><small>管理员</small></div></div><button className={styles.iconButton} onClick={onLogout} aria-label="退出登录" title="退出登录"><SignOut size={19} /></button></div></header>
}
