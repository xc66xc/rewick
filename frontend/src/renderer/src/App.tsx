import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Desktop, FileText, WarningCircle, X } from '@phosphor-icons/react'
import AnswerPanel from './components/AnswerPanel'
import AutoAnswerControls from './components/AutoAnswerControls'
import ContextPage from './components/ContextPage'
import ErrorBoundary from './components/ErrorBoundary'
import HistoryPage from './components/HistoryPage'
import InterviewEnvironmentsPage from './components/InterviewEnvironmentsPage'
import IconButton from './components/IconButton'
import SettingsDialog from './components/SettingsDialog'
import Sidebar, { type Page } from './components/Sidebar'
import Topbar from './components/Topbar'
import TranscriptPanel from './components/TranscriptPanel'
import { errorMessage, useSettings } from './hooks/useSettings'
import { useSession } from './hooks/useSession'
import { isAsrReady } from './hooks/useAutoAnswer'
import styles from './styles/App.module.css'

const bridge = window.copilot
export default function App() {
  const config = useSettings(bridge)
  const session = useSession(bridge, config.settings, config.save, config.apply)
  const [page, setPage] = useState<Page>('workspace')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [windowError, setWindowError] = useState('')
  const main = useRef<HTMLElement>(null)
  useEffect(() => { main.current?.querySelector<HTMLElement>('h1')?.focus() }, [page])
  async function handleCompact() {
    try { await bridge?.setCompact(!compact); setCompact(!compact); setPage('workspace') }
    catch (reason) { setWindowError(errorMessage(reason)) }
  }
  async function handlePin() {
    try { if (bridge) setPinned(await bridge.setAlwaysOnTop(!pinned)) }
    catch (reason) { setWindowError(errorMessage(reason)) }
  }
  function handleSettings() { setSettingsOpen(true) }
  function handleContext() { setPage('context') }
  async function handleEnvironment(id: string) { await session.activateEnvironment(id); setPage('workspace') }
  const error = session.error || config.error || windowError
  const targetLabel = [config.settings.interviewTarget.companyName, config.settings.interviewTarget.roleName].filter(Boolean).join(' · ')
  const environment = config.settings.interviewEnvironment
  const environmentSummary = environment ? `${environment.resumeName || '未选简历'} · ${environment.targetName || '未选岗位'} · ${environment.referenceIds.length} 份参考资料` : ''
  return <ErrorBoundary><div className={`${styles.app} ${compact ? styles.appCompact : ''}`}>
    <Topbar compact={compact} pinned={pinned} onCompact={() => void handleCompact()} onPin={() => void handlePin()} onSettings={handleSettings} desktop={Boolean(bridge)} />
    <div className={styles.appBody}>{!compact && <Sidebar page={page} onChange={setPage} onNew={() => { void session.reset(); setPage('workspace') }} canReset={!session.busy && ['idle', 'error'].includes(session.status)} />}
      <main className={styles.main} ref={main}>
        {!bridge && <div className={styles.previewBanner}><Desktop size={16} weight="bold" /><span>界面预览 · 请打开桌面应用以采集音频、保存配置和连接模型。</span></div>}
        {error && <div className={styles.errorBanner} role="alert"><WarningCircle size={19} weight="fill" /><span>{error}</span><IconButton label="关闭提示" onClick={() => { session.clearError(); setWindowError('') }}><X size={17} /></IconButton></div>}
        {page === 'workspace' && <div className={styles.workspace}>
          {!compact && <header className={styles.workspaceHeading}><div className={styles.workspaceIdentity}><h1 className={styles.workspaceTitle} tabIndex={-1}>面试工作台</h1><span className={styles.workspaceTarget} title={targetLabel || undefined}>{targetLabel || '为下一句，准备好思路'}</span></div><div className={`${styles.contextStatus} ${styles.workspaceContextStatus}`}><FileText size={16} weight="bold" />{config.settings.context.text ? '个人背景已就绪' : '尚未添加个人背景'}<button onClick={handleContext} aria-label="编辑个人背景"><ArrowRight size={16} /></button></div></header>}
          {!compact && environment && <div className={styles.environmentBar}><div><strong title={environment.name}>{environment.name}</strong><span title={environmentSummary}>{environmentSummary}</span></div><button className={styles.textButton} onClick={() => setPage('environments')}>选择面试环境<ArrowRight size={16} /></button></div>}
          {!compact && !config.loading && !isAsrReady(config.settings) && <div className={styles.setupBanner}><div><span className={styles.setupDot} /><span>准备开始？先连接转写服务和回答模型。</span></div><button onClick={handleSettings}>完成配置<ArrowRight size={16} /></button></div>}
          {compact && <div className={styles.compactStatus}><span className={`${styles.statusDot} ${session.status === 'listening' ? styles.statusDotLive : ''}`} />{session.status === 'listening' ? '转写持续进行中' : '紧凑工作台'}{['listening', 'connecting'].includes(session.status) && <button className={styles.textButton} onClick={() => void session.stop()}>停止转写</button>}</div>}
          {compact && targetLabel && <div className={styles.contextStatus}>{targetLabel}</div>}
          {compact && config.settings.interviewEnvironment && <div className={styles.contextStatus}>环境：{config.settings.interviewEnvironment.name}</div>}
          {compact && <AutoAnswerControls session={session} compact />}
          <div className={styles.workspacePanels}>{!compact && <TranscriptPanel session={session} />}<AnswerPanel session={session} settings={config.settings} onSettings={handleSettings} onContext={handleContext} compact={compact} /></div>
          {!compact && <footer className={styles.workspaceFooter}><span>声音不落盘 · 会话保存在本机</span><span>系统音频可自动回答，也可随时手动生成</span></footer>}
        </div>}
        {page === 'environments' && <InterviewEnvironmentsPage settings={config.settings} bridge={bridge} isSessionActive={session.busy || !['idle', 'error'].includes(session.status)} onActivate={handleEnvironment} onSave={session.saveEnvironment} />}
        {page === 'context' && <ContextPage settings={config.settings} bridge={bridge} onSave={config.save} />}
        {page === 'history' && <HistoryPage records={session.history} activeSessionId={session.record.id} activeSessionLocked={session.busy || !['idle', 'error'].includes(session.status)} onExport={session.exportRecord} onDelete={session.removeSession} />}
      </main>
    </div>
    {settingsOpen && <SettingsDialog settings={config.settings} bridge={bridge} onSave={config.save} onClose={() => setSettingsOpen(false)} />}
  </div></ErrorBoundary>
}
