import MockInterviewConfigPage from './pages/MockInterviewConfigPage'
import OperationsPage from './pages/OperationsPage'
import type { TraceSelection } from './components/operations/OperationsTraces'
import ClientDownloadsPage from './pages/ClientDownloadsPage'
import InvitationsPage from './pages/InvitationsPage'
import { useEffect, useRef, useState } from 'react'
import { DownloadSimple, Users, SlidersHorizontal, EnvelopeSimple, ListBullets, ClockCounterClockwise, SignOut, Gift, Receipt, CreditCard } from '@phosphor-icons/react'
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
type PageId = 'mock-interviews' | 'operations' | 'downloads' | 'invitations' | 'users' | 'config' | 'email' | 'usage' | 'audit' | 'packages' | 'payment-orders' | 'payment-config'
const groups = [
  { name: '运营管理', pages: [{ id: 'operations', name: '运营观测', icon: ListBullets }, { id: 'users', name: '用户管理', icon: Users }, { id: 'packages', name: '套餐管理', icon: Gift }, { id: 'payment-orders', name: '支付订单', icon: Receipt }, { id: 'invitations', name: '邀请奖励', icon: Gift }] },
  { name: '服务配置', pages: [{ id: 'mock-interviews', name: '模拟面试', icon: Users }, { id: 'config', name: '模型与服务', icon: SlidersHorizontal }, { id: 'payment-config', name: '支付设置', icon: CreditCard }, { id: 'email', name: '邮件服务', icon: EnvelopeSimple }] },
  { name: '系统管理', pages: [{ id: 'downloads', name: '客户端下载', icon: DownloadSimple }, { id: 'usage', name: '调用记录', icon: ListBullets }, { id: 'audit', name: '操作日志', icon: ClockCounterClockwise }] }
] as const
const pages = groups.flatMap(group => [...group.pages])
export default function App() {
  const auth = useAuth()
  const [page, setPage] = useState<PageId>('users')
  const [initialTrace, setInitialTrace] = useState<TraceSelection | undefined>(undefined)
  const [visited, setVisited] = useState<Set<PageId>>(new Set(['users']))
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [page, auth.session])
  if (auth.checking) return <LoadState>正在验证管理会话…</LoadState>
  if (!auth.session) return <LoginPage busy={auth.busy} error={auth.error} onLogin={auth.login} />
  function navigate(next: PageId) { setPage(next); setVisited(current => new Set([...current, next])) }
  const { api, admin } = auth.session
  return <div className={styles.shell}><aside className={styles.sidebar}><div className={styles.brand}><img className={styles.brandMark} src="/rewick-icon.png" alt="" width={36} height={36} /><div>掌灯 Rewick<small>管理后台</small></div></div><nav className={styles.navigation} aria-label="管理导航">{groups.map(group => <div key={group.name} className={styles.navGroup}><p>{group.name}</p>{group.pages.map(item => <button key={item.id} className={page === item.id ? styles.navActive : styles.navButton} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={20} weight={page === item.id ? 'fill' : 'regular'} />{item.name}</button>)}</div>)}</nav><div className={styles.sidebarFooter}><span className={styles.avatar}>管</span><div><strong>{admin.displayName}</strong><small>管理员</small></div></div></aside>
    <div className={styles.mainColumn}><header className={styles.topbar}><div><p className={styles.breadcrumb}>{groups.find(group => group.pages.some(item => item.id === page))?.name}<span>/</span>{pages.find(item => item.id === page)?.name}</p><h1 className={styles.srOnly} ref={heading} tabIndex={-1}>{pages.find(item => item.id === page)?.name}</h1></div><div className={styles.account}><div><strong>{admin.displayName}</strong><small>管理员</small></div><button type="button" className={styles.secondaryButton} onClick={() => { setPage('users'); setVisited(new Set(['users'])); setInitialTrace(undefined); void auth.logout() }}><SignOut size={18} />退出登录</button></div></header>
      <main className={styles.mainContent}>{page === 'mock-interviews' && <ErrorBoundary><MockInterviewConfigPage api={api} /></ErrorBoundary>}{visited.has('operations') && <div hidden={page !== 'operations'}><ErrorBoundary><OperationsPage api={api} active={page === 'operations'} initialTrace={initialTrace} /></ErrorBoundary></div>}{page === 'downloads' && <ErrorBoundary><ClientDownloadsPage api={api} /></ErrorBoundary>}{page === 'invitations' && <ErrorBoundary><InvitationsPage api={api} /></ErrorBoundary>}{page === 'packages' && <ErrorBoundary><PackagesPage api={api} /></ErrorBoundary>}{page === 'payment-orders' && <ErrorBoundary><PaymentOrdersPage api={api} /></ErrorBoundary>}{page === 'payment-config' && <ErrorBoundary><PaymentConfigPage api={api} /></ErrorBoundary>}{visited.has('users') && <div hidden={page !== 'users'}><ErrorBoundary><UsersPage api={api} /></ErrorBoundary></div>}{visited.has('config') && <div hidden={page !== 'config'}><ErrorBoundary><ConfigPage api={api} active={page === 'config'} /></ErrorBoundary></div>}{visited.has('email') && <div hidden={page !== 'email'}><ErrorBoundary><EmailConfigPage api={api} active={page === 'email'} /></ErrorBoundary></div>}{visited.has('usage') && <div hidden={page !== 'usage'}><ErrorBoundary><UsagePage api={api} onOpenTrace={selection => { setInitialTrace(selection); navigate('operations') }} /></ErrorBoundary></div>}{visited.has('audit') && <div hidden={page !== 'audit'}><ErrorBoundary><AuditPage api={api} /></ErrorBoundary></div>}</main>
    </div>
  </div>
}
