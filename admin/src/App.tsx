import ClientDownloadsPage from './pages/ClientDownloadsPage'
import InvitationsPage from './pages/InvitationsPage'
import { useEffect, useRef, useState } from 'react'
import { Users, SlidersHorizontal, EnvelopeSimple, ListBullets, ClockCounterClockwise, SignOut, Gift, Receipt, CreditCard } from '@phosphor-icons/react'
import { useAuth } from './hooks/useAuth'
import LoadState from './components/LoadState'
import LoginPage from './pages/LoginPage'
import UsersPage from './pages/UsersPage'
import ConfigPage from './pages/ConfigPage'
import EmailConfigPage from './pages/EmailConfigPage'
import UsagePage from './pages/UsagePage'
import AuditPage from './pages/AuditPage'
import PackagesPage from './pages/PackagesPage'
import PaymentOrdersPage from './pages/PaymentOrdersPage'
import PaymentConfigPage from './pages/PaymentConfigPage'
import ErrorBoundary from './components/ErrorBoundary'
import styles from './styles.module.css'
type PageId = 'downloads' | 'invitations' | 'users' | 'config' | 'email' | 'usage' | 'audit' | 'packages' | 'payment-orders' | 'payment-config'
const pages = [ { id: 'downloads', name: '客户端下载', icon: Gift }, { id: 'invitations', name: '邀请奖励', icon: Gift }, { id: 'packages', name: '套餐管理', icon: Gift }, { id: 'payment-orders', name: '支付订单', icon: Receipt }, { id: 'payment-config', name: '支付设置', icon: CreditCard },{ id: 'users', name: '用户管理', icon: Users }, { id: 'config', name: '平台配置', icon: SlidersHorizontal }, { id: 'email', name: '邮件服务', icon: EnvelopeSimple }, { id: 'usage', name: '调用记录', icon: ListBullets }, { id: 'audit', name: '操作日志', icon: ClockCounterClockwise }] as const
export default function App() {
  const auth = useAuth()
  const [page, setPage] = useState<PageId>('users')
  const [visited, setVisited] = useState<Set<PageId>>(new Set(['users']))
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [page, auth.session])
  if (auth.checking) return <LoadState>正在验证管理会话…</LoadState>
  if (!auth.session) return <LoginPage busy={auth.busy} error={auth.error} onLogin={auth.login} />
  function navigate(next: PageId) { setPage(next); setVisited(current => new Set([...current, next])) }
  const { api, admin } = auth.session
  return <div className={styles.shell}><aside className={styles.sidebar}><div className={styles.brand}><span className={styles.brandMark}>R</span><div>掌灯 Rewick<small>平台管理</small></div></div><nav className={styles.navigation} aria-label="管理导航">{pages.map(item => <button key={item.id} className={page === item.id ? styles.navActive : styles.navButton} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={20} weight={page === item.id ? 'fill' : 'regular'} />{item.name}</button>)}</nav><div className={styles.sidebarFooter}><span className={styles.badge}>管理控制台</span><p>配置清楚，服务有序。</p></div></aside>
    <div className={styles.mainColumn}><header className={styles.topbar}><div><p className={styles.eyebrow}>掌灯 Rewick / ADMIN</p><h1 ref={heading} tabIndex={-1}>{pages.find(item => item.id === page)?.name}</h1></div><div className={styles.account}><div><strong>{admin.displayName}</strong><small>管理员</small></div><button type="button" className={styles.secondaryButton} onClick={() => { setPage('users'); setVisited(new Set(['users'])); void auth.logout() }}><SignOut size={18} />退出登录</button></div></header>
      <main className={styles.mainContent}>{page === 'downloads' && <ErrorBoundary><ClientDownloadsPage api={api} /></ErrorBoundary>}{page === 'invitations' && <ErrorBoundary><InvitationsPage api={api} /></ErrorBoundary>}{page === 'packages' && <ErrorBoundary><PackagesPage api={api} /></ErrorBoundary>}{page === 'payment-orders' && <ErrorBoundary><PaymentOrdersPage api={api} /></ErrorBoundary>}{page === 'payment-config' && <ErrorBoundary><PaymentConfigPage api={api} /></ErrorBoundary>}{visited.has('users') && <div hidden={page !== 'users'}><ErrorBoundary><UsersPage api={api} /></ErrorBoundary></div>}{visited.has('config') && <div hidden={page !== 'config'}><ErrorBoundary><ConfigPage api={api} active={page === 'config'} /></ErrorBoundary></div>}{visited.has('email') && <div hidden={page !== 'email'}><ErrorBoundary><EmailConfigPage api={api} active={page === 'email'} /></ErrorBoundary></div>}{visited.has('usage') && <div hidden={page !== 'usage'}><ErrorBoundary><UsagePage api={api} /></ErrorBoundary></div>}{visited.has('audit') && <div hidden={page !== 'audit'}><ErrorBoundary><AuditPage api={api} /></ErrorBoundary></div>}</main>
    </div>
  </div>
}
