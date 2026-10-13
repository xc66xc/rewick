import EnvironmentStampDialog from './EnvironmentStampDialog'
import useEnvironmentStampEditor from '../hooks/useEnvironmentStampEditor'
import { environmentHotwordsError } from '../../../shared/environment-hotwords'
import InviteFriendsButton from './invitation/InviteFriendsButton'
import { useState } from 'react'
import { CheckCircle, PlusCircle } from '@phosphor-icons/react'
import type { DesktopBridge, EnvironmentInput, InterviewEnvironment, Settings } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import useInterviewLibrary from '../hooks/useInterviewLibrary'
import useLibraryDraft from '../hooks/useLibraryDraft'
import { formatDuration, type useInterviewTime } from '../hooks/useInterviewTime'
import RefreshTimeButton from './RefreshTimeButton'
import DraftChangeNotice from './DraftChangeNotice'
import EnvironmentCard from './EnvironmentCard'
import EnvironmentDialog from './EnvironmentDialog'
import { Button } from './ui/button'
import { ConfirmModal } from './ui/dialog'
import { formNoteClass, inlineErrorClass, successNoticeClass, textButtonClass } from '../lib/form'
import { cn } from '../lib/cn'

interface Props {
  bridge: DesktopBridge; settings: Settings; timer: ReturnType<typeof useInterviewTime>; isSessionActive: boolean
  onPrepare: (input: EnvironmentInput) => Promise<void>; onSave: (input: EnvironmentInput) => Promise<void>
  onStarted: () => void; onContext: () => void; onSettings: () => void; onPurchase?: () => void; onHistory?: () => void
}
const emptyEnvironment: EnvironmentInput = { interviewType: 'technical', jobExperienceLevel: null, name: '', resumeId: null, targetId: null, referenceIds: [] }
function environmentInput({ id, name, interviewType, resumeId, targetId, referenceIds, version, hotwords, jobExperienceLevel }: InterviewEnvironment): EnvironmentInput { return { id, name, interviewType, resumeId, targetId, referenceIds, version, hotwords, ...(jobExperienceLevel !== undefined ? { jobExperienceLevel } : {}) } }
/* v30 准备面试页:钱包页头 + 摘要卡 + 环境卡片网格,新建/编辑走弹窗(原「面试环境」页已并入) */
export default function InterviewPreparation({ bridge, settings, timer, isSessionActive, onPrepare, onSave, onStarted, onContext, onSettings, onPurchase, onHistory }: Props) {
  const data = useInterviewLibrary(bridge)
  const stampEditor = useEnvironmentStampEditor(bridge, settings.accountScope, data.acceptLibrary)
  const records = data.library?.environments.map(environmentInput) ?? []
  const editor = useLibraryDraft<EnvironmentInput>(records, emptyEnvironment, Boolean(data.library), settings.interviewEnvironment?.id, 'environment-library')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InterviewEnvironment | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const activeId = data.library?.activeEnvironmentId
  const editingBlocked = editor.draft.id !== undefined && editor.draft.id === activeId && (isSessionActive || timer.active)
  function openModal() { setNotice(''); setError(''); setDialogOpen(true) }
  function requestNew() { editor.request(() => { editor.replace(emptyEnvironment); openModal() }) }
  function requestEdit(environment: InterviewEnvironment) {
    if (environment.id === editor.draft.id) { openModal(); return }
    editor.request(() => { editor.replace(environmentInput(environment)); openModal() })
  }
  async function handleSave() {
    if (busy || editingBlocked || !editor.draft.name.trim()) return
    const hotwordsError = environmentHotwordsError(editor.draft.hotwords ?? [])
    if (hotwordsError) { setError(hotwordsError); return }
    setBusy(true); setError(''); setNotice('')
    const input = { ...editor.draft, name: editor.draft.name.trim() }
    const savedCurrent = input.id !== undefined && input.id === activeId
    try {
      await onSave(input)
      const next = await data.reload()
      const saved = next?.environments.find(record => input.id ? record.id === input.id : !records.some(previous => previous.id === record.id))
      editor.replace(saved ? environmentInput(saved) : input)
      setDialogOpen(false)
      setNotice(!next ? '环境已保存，但列表刷新失败。请重新读取后确认。' : savedCurrent ? '当前环境已更新，旧会话已保存。下一次回答使用新的组合。' : '环境已保存，可在卡片上点击「开始面试」。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleRemove(id: string) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      data.acceptLibrary(await bridge.removeEnvironment(id))
      if (editor.draft.id === id) editor.replace(emptyEnvironment)
      setDeleteTarget(null)
      setNotice('环境已删除，简历、岗位和参考资料仍保留在库中。')
    } catch (reason) { setDeleteTarget(null); setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function start(environment: InterviewEnvironment) {
    if (busy || timer.active) return
    setBusy(true); setError('')
    try { await onPrepare(environmentInput(environment)); await timer.start(environment.id); onStarted() }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  return <section className="flex flex-1 flex-col p-8 max-[820px]:p-5" aria-labelledby="preparation-title">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 id="preparation-title" tabIndex={-1} className="text-[28px] leading-[1.3] font-semibold tracking-[-0.04em] max-[820px]:text-2xl">准备面试</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* v30 .prep-wallet:标签次要小字,时长值 mono 蓝色强调(≤60s 转红),刷新钮 30px */}
        <div className="flex items-center gap-[9px]"><strong className="text-xs font-medium text-text-secondary">可用时长</strong><span className={cn('font-mono text-[13px] font-semibold tabular-nums text-accent-text', timer.remaining <= 60 && 'text-danger')}>{formatDuration(timer.remaining)}</span><RefreshTimeButton className="size-[30px] text-accent-text hover:bg-accent/10" refreshing={timer.refreshing} onRefresh={timer.refresh} /></div>
        <InviteFriendsButton bridge={bridge} />
        {onPurchase && <Button onClick={onPurchase}>购买时长</Button>}
      </div>
    </header>
    {(error || timer.error || data.error) && <p className={inlineErrorClass} role="alert">{error || timer.error || data.error}</p>}
    {data.error && <button type="button" className={textButtonClass} disabled={busy} onClick={() => void data.retry()}>重新读取环境资料</button>}
    {timer.wallet?.session?.status === 'active' && !timer.active && <p className={formNoteClass}>该账号已有正在进行的面试，请先在原窗口结束；异常关闭后最多等待 30 秒再开始。</p>}
    {isSessionActive && <p className="mb-5 rounded-chip border border-accent-line bg-accent-subtle px-4 py-3 text-xs leading-[1.8] text-text-secondary">正在转写或回答。停止后可进入其他环境或修改当前环境组合。</p>}
    {data.loading && <p className={formNoteClass} role="status">正在读取面试资料…</p>}
    {timer.wallet && timer.remaining === 0 && <p className={formNoteClass}>暂无可用时长，可前往「购买时长」选择套餐。</p>}
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-control border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-text-heading"><span className="size-2 rounded-full bg-accent" aria-hidden="true" />连接已就绪</h2>
        <span className="h-4 border-l border-border" aria-hidden="true" />
        <Button variant="quiet" size="xs" className="text-accent-text" onClick={onSettings}>模型与设置</Button>
      </div>
      {timer.wallet?.session?.status === 'ended' && <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span>上次使用 {formatDuration(timer.wallet.session.usedSeconds)}</span>
        {onHistory && <Button variant="quiet" size="xs" className="text-accent-text" onClick={onHistory}>查看记录</Button>}
      </div>}
    </div>
    <div className="mb-3.5 mt-6 flex flex-wrap items-baseline gap-2.5">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-text-heading">我的面试准备</h2>
    </div>
    {editor.pending && <DraftChangeNotice onKeep={editor.keepDraft} onDiscard={editor.discardAndContinue} />}
    {editor.restored && <p className="mb-4 text-xs leading-[1.85] text-text-secondary" role="status">已恢复尚未保存的环境草稿，保留到本次关闭应用前。保存环境后才会生效。</p>}
    {notice && <p className={cn(successNoticeClass, 'mt-0 mb-3')} role="status"><CheckCircle size={18} />{notice}</p>}
    {data.library && <ul aria-label="已保存面试环境" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4 p-0">
      {data.library.environments.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(environment => {
        const resume = data.library?.resumes.find(item => item.id === environment.resumeId)
        const target = data.library?.targets.find(item => item.id === environment.targetId)
        const resumeReady = Boolean(resume?.hasContent ?? resume?.text.trim())
        const startBlocked = !resumeReady ? ('resume' as const) : !timer.wallet || timer.remaining <= 0 ? ('wallet' as const) : false
        return <li key={environment.id} className="min-w-0">
          <EnvironmentCard environment={environment} resume={resume} target={target} current={environment.id === activeId}
            resumeReady={resumeReady} startBlocked={startBlocked} busy={busy} timerActive={timer.active} sessionActive={isSessionActive || timer.active}
            onStamp={() => stampEditor.open(environment)}
            onEdit={() => requestEdit(environment)}
            onDelete={() => setDeleteTarget(environment)}
            onStart={() => void start(environment)} onReturn={onStarted} onContext={onContext} />
        </li>
      })}
      <li className="min-w-0">
        <Button variant="quiet" aria-label="新建面试准备" onClick={requestNew} disabled={!data.library || busy} className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border-dashed bg-card p-5 text-center text-text-muted transition-colors hover:border-accent hover:text-accent-text">
          <PlusCircle size={22} aria-hidden="true" />
          <span className="text-[13.5px] font-semibold text-text-secondary">为下一次机会做准备</span>
          <span className="text-[11.5px]">选择简历、岗位与参考资料</span>
        </Button>
      </li>
    </ul>}
    <EnvironmentStampDialog editor={stampEditor} />
    <EnvironmentDialog onExtractHotwords={input => bridge.extractEnvironmentHotwords(input)} open={dialogOpen} onOpenChange={setDialogOpen} draft={editor.draft} dirty={editor.dirty} library={data.library}
      references={data.references} referencesReady={data.referencesReady} settings={settings} busy={busy}
      editingBlocked={editingBlocked} error={error}
      onChange={editor.setDraft} onSave={() => void handleSave()} />
    <ConfirmModal open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) setDeleteTarget(null) }} title="删除环境" danger confirmText="确认删除"
      description={`将删除「${deleteTarget?.name.trim() || '未命名环境'}」，无法撤销。其中的简历、岗位和参考资料仍保留在资料库中。`}
      onConfirm={() => deleteTarget && void handleRemove(deleteTarget.id)} />
  </section>
}
