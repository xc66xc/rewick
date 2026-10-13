import JobExperienceTag from './components/JobExperienceTag'
import InterviewRecordingControl from './components/InterviewRecordingControl'
import { useInterviewRecording } from './hooks/useInterviewRecording'
import ContentProtectionControl from './components/ContentProtectionControl'
import CompactStatus from './components/CompactStatus'
import CompactAppearance from './components/CompactAppearance'
import { defaultCompactFontSize, defaultWindowPreferences, type WindowPreferences } from '../../shared/window-preferences'
import type { CSSProperties } from 'react'
import { interviewTypeLabels } from '../../shared/interview-type'
import { Pill } from './components/ui/pill'
import PurchasePage from './components/payment/PurchasePage'
import { useMemo, useEffect, useRef, useState } from 'react'
import { ArrowRight, Briefcase, WarningCircle, X } from '@phosphor-icons/react'
import RefreshTimeButton from './components/RefreshTimeButton'
import InterviewPreparation from './components/InterviewPreparation'
import { useInterviewTime, formatDuration } from './hooks/useInterviewTime'
import AnswerPanel from './components/AnswerPanel'
import AutoAnswerControls from './components/AutoAnswerControls'
import ContextPage from './components/ContextPage'
import ErrorBoundary from './components/ErrorBoundary'
import HistoryPage from './components/HistoryPage'
import { Button, IconButton } from './components/ui/button'
import { toast } from './components/ui/toast'
import SettingsDialog from './components/SettingsDialog'
import Sidebar, { type Page } from './components/Sidebar'
import Topbar from './components/Topbar'
import TranscriptPanel from './components/TranscriptPanel'
import { errorMessage, type useSettings } from './hooks/useSettings'
import type { DesktopBridge } from '../../shared/types'
import { useSession } from './hooks/useSession'
import { isAsrReady } from './hooks/useAutoAnswer'
import { cn } from './lib/cn'
import { formNoteClass } from './lib/form'

interface WorkbenchProps { bridge: DesktopBridge; config: ReturnType<typeof useSettings>; onLogout: () => Promise<void> }
export default function Workbench({ bridge: unscopedBridge, config, onLogout }: WorkbenchProps) {
  const bridge = useMemo(() => unscopedBridge.withAccountScope?.(config.settings.accountScope ?? '') ?? unscopedBridge, [unscopedBridge, config.settings.accountScope])
  const timer = useInterviewTime(bridge)
  const session = useSession(bridge, config.settings, config.save, config.apply)
  const recording = useInterviewRecording(bridge, session.record.id, timer.active, async () => {
    const id = timer.wallet?.session?.id
    if (!id) throw new Error('请先开始面试。')
    await session.prepareRecording(id)
  })
  const [page, setPage] = useState<Page>('preparation')
  useEffect(() => {
    if (recording.error) toast.show(recording.error, { type: 'error' })
  }, [recording.error])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [appearance, setAppearance] = useState(defaultWindowPreferences)
  const [fontPreview, setFontPreview] = useState<number | null>(null)
  const [opacityPreview, setOpacityPreview] = useState<number | null>(null)
  const [savingAppearance, setSavingAppearance] = useState(false)
  const [appearanceReady, setAppearanceReady] = useState(false)
  const [windowError, setWindowError] = useState('')
  useEffect(() => {
    let current = true
    setAppearanceReady(false)
    void bridge.getWindowPreferences().then(value => { if (current) { setAppearance(value); setAppearanceReady(true) } })
      .catch(reason => { if (current) setWindowError(errorMessage(reason)) })
    const unsubscribe = bridge.onEvent(event => { if (event.kind === 'window-mode') setCompact(event.compact) })
    return () => { current = false; unsubscribe() }
  }, [bridge])
  useEffect(() => {
    document.documentElement.classList.toggle('compact-transparent', compact)
    return () => document.documentElement.classList.remove('compact-transparent')
  }, [compact])
  async function saveAppearance(value: WindowPreferences) {
    setSavingAppearance(true)
    try { setAppearance(await bridge.saveWindowPreferences(value)) }
    catch (reason) { toast.show(errorMessage(reason), { type: 'error' }) }
    finally { setFontPreview(null); setOpacityPreview(null); setSavingAppearance(false) }
  }
  const main = useRef<HTMLElement>(null)
  const loggingOut = useRef(false)
  const [leaving, setLeaving] = useState(false)
  async function handleLogout() {
    if (loggingOut.current) return
    loggingOut.current = true; setLeaving(true)
    try { await recording.stop(); await Promise.all([timer.end(), session.stop(), session.cancel()]); await session.saveHistory(); await onLogout() }
    finally { loggingOut.current = false; setLeaving(false) }
  }
  useEffect(() => { main.current?.querySelector<HTMLElement>('h1')?.focus() }, [page])
  useEffect(() => () => {
    // A new authenticated workbench starts in full, unpinned mode.
    void bridge.setCompact(false).catch(() => undefined)
    void bridge.setAlwaysOnTop(false).catch(() => undefined)
  }, [bridge])
  useEffect(() => {
    if (timer.active || !compact) return
    let current = true
    void bridge.setCompact(false).then(() => { if (current) setCompact(false) })
      .catch(reason => { if (current) setWindowError(errorMessage(reason)) })
    return () => { current = false }
  }, [timer.active, compact, bridge])
  async function handleCompact() {
    /* v30:紧凑模式仅在面试进行中可用;静默返回会被当成按钮失灵,给出明确提示 */
    if (!timer.active && !compact) { toast.show('紧凑模式在面试进行中可用 · 先开始面试'); return }
    try { await bridge?.setCompact(!compact); setCompact(!compact); setPage('workspace') }
    catch (reason) { setWindowError(errorMessage(reason)) }
  }
  async function handlePin() {
    try { if (bridge) setPinned(await bridge.setAlwaysOnTop(!pinned)) }
    catch (reason) { setWindowError(errorMessage(reason)) }
  }
  function handleSettings() { setSettingsOpen(true) }
  function handleContext() { setPage('context') }
  async function handleEnd() {
    await recording.stop()
    await Promise.all([timer.end(), session.stop(), session.cancel()])
    await session.saveHistory().catch(reason => setWindowError(`面试已停止计时，但会话保存失败：${errorMessage(reason)}`))
    setPage('preparation')
  }
  async function handlePrepare(input: Parameters<typeof session.saveEnvironment>[0]) {
    await session.saveEnvironment(input)
    if (input.id) await session.activateEnvironment(input.id)
  }
  function navigate(next: Page) { setPage(next === 'workspace' && !timer.active ? 'preparation' : next) }
  useEffect(() => {
    if (!timer.active && page === 'workspace') setPage('preparation')
  }, [timer.active, page])
  const error = timer.error || session.error || config.error || windowError
  const environment = config.settings.interviewEnvironment
  /* v30 骨架 §2:白色无缝 chrome(侧栏/顶栏无边框),主内容区是一张 12px 圆角 + 1px 边线的灰蓝画布卡,白卡浮在其上 */
  return <ErrorBoundary><div className={cn('flex h-dvh min-h-[480px] flex-col overflow-hidden bg-page', compact && 'compact-surface')} style={compact ? { '--compact-opacity': (opacityPreview ?? appearance.backgroundOpacity) / 100, '--compact-font-size': `${fontPreview ?? appearance.fontSize ?? defaultCompactFontSize}px` } as CSSProperties : undefined}>
    <Topbar compact={compact} pinned={pinned} onCompact={() => void handleCompact()} onPin={() => void handlePin()} onSettings={handleSettings} desktop={Boolean(bridge)} loggingOut={leaving} compactControls={<CompactAppearance onFontPreview={setFontPreview} preferences={{ ...appearance, fontSize: fontPreview ?? appearance.fontSize, backgroundOpacity: opacityPreview ?? appearance.backgroundOpacity }} onPreview={setOpacityPreview} saving={savingAppearance || !appearanceReady} onChange={value => void saveAppearance(value)}><AutoAnswerControls session={session} compact /></CompactAppearance>} />
    <div className="flex min-h-0 flex-1" inert={leaving}>{!compact && <Sidebar page={page} onChange={navigate} account={config.settings.platform?.user?.displayName} />}
      <main className="mb-3 mr-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-card border border-border bg-canvas" ref={main}>
        {error && <div className="flex shrink-0 items-center gap-2 border-b border-danger-line bg-danger-subtle px-5 py-2 text-sm text-danger" role="alert"><WarningCircle size={19} aria-hidden="true" /><span className="flex-1 [overflow-wrap:anywhere]">{error}</span><IconButton aria-label="关闭提示" title="关闭提示" onClick={() => { session.clearError(); setWindowError('') }}><X size={17} aria-hidden="true" /></IconButton></div>}
        {/* v30 session-bar:浅蓝底 + 蓝细边 + 蓝字,脉冲点,mono 时长(可用 ≤60s 转红),刷新钮移到右组 */}
        {timer.active && !compact && <div className="mx-8 mt-4 mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3.5 rounded-chip border border-accent-line bg-accent-subtle px-3.5 py-[9px] text-xs font-medium text-accent-text max-[820px]:mx-5 max-[820px]:mt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5"><span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse-dot rounded-full bg-accent" /><span className="min-w-0 truncate">面试进行中 · 已用 <b className="font-mono font-semibold tabular-nums">{formatDuration(timer.used)}</b> · 可用 <b className={cn('font-mono font-semibold tabular-nums', timer.remaining <= 60 && 'text-danger')}>{formatDuration(timer.remaining)}</b></span></div>
          <div className="flex flex-wrap items-center gap-2.5"><InterviewRecordingControl recording={recording} /><RefreshTimeButton className="size-[30px] text-accent-text hover:bg-accent/10" refreshing={timer.refreshing} onRefresh={timer.refresh} /><Button variant="primary" size="sm" disabled={timer.busy} onClick={() => void handleEnd()}>结束面试</Button></div>
        </div>}
        {timer.active && compact && <CompactStatus recording={<InterviewRecordingControl recording={recording} />} session={session} remaining={timer.remaining} ending={timer.busy} onEnd={() => void handleEnd()} />}
        {timer.warning && timer.active && <p className={cn(formNoteClass, 'px-8 pt-1 max-[820px]:px-5')} role="status">{timer.warning}</p>}
        {page === 'preparation' && <InterviewPreparation bridge={bridge} settings={config.settings} timer={timer} isSessionActive={timer.active || session.busy || !['idle', 'error'].includes(session.status)} onPrepare={handlePrepare} onSave={session.saveEnvironment} onStarted={() => setPage('workspace')} onContext={handleContext} onSettings={handleSettings} onPurchase={() => setPage('purchase')} onHistory={() => setPage('history')} />}
        {page === 'workspace' && timer.active && <div className={cn('flex min-h-0 flex-1 flex-col', compact ? 'p-0' : 'px-8 pb-0')}>
          {/* 工作台顶部仅展示面试名称与面试类型 */}
          {!compact && environment && <div className="mb-3 flex shrink-0 items-center justify-between gap-3 text-xs"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="inline-flex h-[34px] min-w-0 max-w-[280px] shrink-0 items-center gap-[7px] rounded-chip border border-border bg-card px-[11px] hover:border-border-hover max-[1180px]:max-w-[220px]" title="面试环境 · 在「面试准备」中修改"><span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-[5px] brand-gradient text-text-on-fill"><Briefcase size={12} aria-hidden="true" /></span><span className="min-w-0 truncate font-semibold">{environment.name}</span></span>
            {environment.interviewType && <Pill>{interviewTypeLabels[environment.interviewType]}</Pill>}
            <JobExperienceTag level={environment.jobExperienceLevel} />
          </div></div>}
          {!compact && !config.loading && !isAsrReady(config.settings) && <div className="mb-5 flex items-center justify-between gap-4 rounded-chip border border-accent-line bg-accent-subtle px-4 py-3 text-xs text-text-primary max-[560px]:px-2 max-[560px]:py-2 max-[560px]:text-[10px]"><div className="flex items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" /><span>准备开始？先连接转写服务和回答模型。</span></div><Button variant="quiet" size="sm" onClick={handleSettings}>完成配置<ArrowRight size={16} aria-hidden="true" /></Button></div>}
          <div className={cn('grid min-h-0 flex-1 grid-cols-[minmax(280px,.72fr)_minmax(400px,1.28fr)] gap-5 wide:grid-cols-[minmax(300px,.75fr)_minmax(430px,1.55fr)] wide:gap-6 max-[1060px]:grid-cols-[minmax(260px,.68fr)_minmax(340px,1.32fr)] max-[1060px]:gap-4 max-[820px]:grid-cols-[minmax(0,1fr)] max-[820px]:overflow-y-auto',
            compact && 'flex overflow-hidden')}>{!compact && <TranscriptPanel session={session} />}<AnswerPanel session={session} settings={config.settings} onSettings={handleSettings} onContext={handleContext} compact={compact} /></div>
          {!compact && <footer className="flex min-h-[42px] shrink-0 items-center justify-between gap-4 text-[10px] text-text-muted max-[560px]:[&>span:last-child]:hidden"><span>会话云端保存：{session.historySyncStatus}</span><span>系统音频可自动回答，也可随时手动生成</span></footer>}
        </div>}
        {page === 'purchase' && <PurchasePage key={config.settings.accountScope} bridge={bridge} scope={config.settings.accountScope ?? ''} remaining={timer.remaining} onCredited={timer.refresh} />}
        {page === 'context' && <ContextPage settings={config.settings} bridge={bridge} onSave={config.save} />}
        {page === 'history' && <HistoryPage bridge={bridge} records={session.history} activeSessionId={session.record.id} activeSessionLocked={timer.active || session.busy || !['idle', 'error'].includes(session.status)} onExport={session.exportRecord} onDelete={session.removeSession} />}
      </main>
    </div>
    {settingsOpen && <SettingsDialog windowControls={<ContentProtectionControl checked={appearance.contentProtection} disabled={savingAppearance || !appearanceReady} onChange={value => void saveAppearance({ ...appearance, contentProtection: value })} />} settings={config.settings} bridge={bridge} onSave={config.save} onApply={config.apply} onLogout={handleLogout} onClose={() => setSettingsOpen(false)} />}
  </div></ErrorBoundary>
}
