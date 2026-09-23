import { ClockCounterClockwise, Key, SignOut, X } from '@phosphor-icons/react'
import type { User } from '../types'
import { dateTime } from '../types'
import styles from '../styles.module.css'
import layout from '../pages/UsersPage.module.css'
export type UserAction = 'edit' | 'password' | 'revoke' | 'wallet' | 'history'
interface UserOverviewProps {
  user: User
  onAction: (kind: UserAction) => void
  onClose: () => void
}
export function clockDuration(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':')
}
export default function UserOverview({ user, onAction, onClose }: UserOverviewProps) {
  return <aside className={layout.overview} aria-label="用户概览">
    <header className={layout.overviewHeader}><h3>用户概览</h3><button className={layout.closeButton} aria-label="关闭用户概览" onClick={onClose}><X size={18} /></button></header>
    <div className={layout.profile}><span className={layout.largeAvatar} aria-hidden="true">{Array.from(user.displayName)[0]?.toUpperCase()}</span><div className={layout.profileText}><h3>{user.displayName}</h3><span className={styles.mutedBadge}>{user.role === 'ADMIN' ? '管理员' : '普通用户'}</span><p>ID {user.id}</p></div></div>
    <dl className={layout.facts}><div><dt>账号状态</dt><dd><span className={user.enabled ? styles.enabledBadge : styles.mutedBadge}>{user.enabled ? '已启用' : '已停用'}</span></dd></div><div><dt>创建时间</dt><dd>{dateTime(user.createdAt)}</dd></div></dl>
    <div className={layout.balance}><span>可用时长</span><strong>{clockDuration(user.availableSeconds)}</strong><button className={styles.primaryButton} onClick={() => onAction('wallet')}>调整时长</button><button className={styles.linkButton} onClick={() => onAction('history')}><ClockCounterClockwise size={18} />查看时长记录</button></div>
    <section className={layout.security} aria-label="账号与安全"><h4>账号与安全</h4><button onClick={() => onAction('edit')}>管理账号状态<span>编辑</span></button><button onClick={() => onAction('password')}><Key size={18} />重置密码</button><button onClick={() => onAction('revoke')}><SignOut size={18} />撤销登录</button></section>
  </aside>
}
