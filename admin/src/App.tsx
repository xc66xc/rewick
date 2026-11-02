import MockInterviewConfigPage from './pages/MockInterviewConfigPage'
import OperationsPage from './pages/OperationsPage'
import type { TraceSelection } from './components/operations/OperationsTraces'
import ClientDownloadsPage from './pages/ClientDownloadsPage'
import InvitationsPage from './pages/InvitationsPage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Palette } from '@phosphor-icons/react'
import { useAppearance } from './hooks/useAppearance'
import { useWorkspaceMotion } from './hooks/useWorkspaceMotion'
import AppearanceSettings from './components/AppearanceSettings'
import AdminNavigation from './components/AdminNavigation'
import WorkspaceHeader from './components/WorkspaceHeader'
import type { PageId } from './navigation'
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
export default function App() {
  const auth = useAuth()
  const display = useAppearance()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMenu = useCallback(() => setMobileOpen(false), [])
  const [page, setPage] = useState<PageId>('users')
  const [initialTrace, setInitialTrace] = useState<TraceSelection | undefined>(undefined)
  const [visited, setVisited] = useState<Set<PageId>>(new Set(['users']))
  const content = useWorkspaceMotion(`${page}:${Boolean(auth.session)}`, display.appearance.motion)
  const appearanceDialog = appearanceOpen && <AppearanceSettings value={display.appearance} error={display.error} onChange={display.update} onClose={() => setAppearanceOpen(false)} />
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [page, auth.session])
  if (auth.checking) return <LoadState>正在验证管理会话…</LoadState>
  if (!auth.session) return <><LoginPage busy={auth.busy} error={auth.error} onLogin={auth.login} /><div className={styles.loginAppearance}><button className={styles.iconButton} onClick={() => setAppearanceOpen(true)} aria-label="外观设置"><Palette size={20} /></button></div>{appearanceDialog}</>
  function navigate(next: PageId) { setPage(next); setVisited(current => new Set([...current, next])) }
  const { api, admin } = auth.session
  return <div className={styles.shell} data-collapsed={collapsed}><a className={styles.skipLink} href="#admin-content">跳到主要内容</a>
    <AdminNavigation page={page} collapsed={collapsed} mobileOpen={mobileOpen} name={admin.displayName} onNavigate={navigate} onClose={closeMenu} />
    <div className={styles.mainColumn}><WorkspaceHeader page={page} name={admin.displayName} collapsed={collapsed} heading={heading} onToggleSidebar={() => setCollapsed(value => !value)} onMobileMenu={() => setMobileOpen(true)} onAppearance={() => setAppearanceOpen(true)} onLogout={() => { setPage('users'); setVisited(new Set(['users'])); setInitialTrace(undefined); setMobileOpen(false); setAppearanceOpen(false); void auth.logout() }} />
      <main id="admin-content" ref={content} tabIndex={-1} className={styles.mainContent}>{page === 'mock-interviews' && <ErrorBoundary><MockInterviewConfigPage api={api} /></ErrorBoundary>}{visited.has('operations') && <div hidden={page !== 'operations'}><ErrorBoundary><OperationsPage api={api} active={page === 'operations'} initialTrace={initialTrace} /></ErrorBoundary></div>}{page === 'downloads' && <ErrorBoundary><ClientDownloadsPage api={api} /></ErrorBoundary>}{page === 'invitations' && <ErrorBoundary><InvitationsPage api={api} /></ErrorBoundary>}{page === 'packages' && <ErrorBoundary><PackagesPage api={api} /></ErrorBoundary>}{page === 'payment-orders' && <ErrorBoundary><PaymentOrdersPage api={api} /></ErrorBoundary>}{page === 'payment-config' && <ErrorBoundary><PaymentConfigPage api={api} /></ErrorBoundary>}{visited.has('users') && <div hidden={page !== 'users'}><ErrorBoundary><UsersPage api={api} /></ErrorBoundary></div>}{visited.has('config') && <div hidden={page !== 'config'}><ErrorBoundary><ConfigPage api={api} active={page === 'config'} /></ErrorBoundary></div>}{visited.has('email') && <div hidden={page !== 'email'}><ErrorBoundary><EmailConfigPage api={api} active={page === 'email'} /></ErrorBoundary></div>}{visited.has('usage') && <div hidden={page !== 'usage'}><ErrorBoundary><UsagePage api={api} onOpenTrace={selection => { setInitialTrace(selection); navigate('operations') }} /></ErrorBoundary></div>}{visited.has('audit') && <div hidden={page !== 'audit'}><ErrorBoundary><AuditPage api={api} /></ErrorBoundary></div>}</main>
    </div>{appearanceDialog}
  </div>
}
