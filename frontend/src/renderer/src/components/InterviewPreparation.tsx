import { useState } from 'react'
import { CheckCircle, Plus, PlusCircle } from '@phosphor-icons/react'
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
import { Eyebrow } from './ui/pill'
import { formNoteClass, inlineErrorClass, successNoticeClass, textButtonClass } from '../lib/form'
import { cn } from '../lib/cn'

interface Props {
  bridge: DesktopBridge; settings: Settings; timer: ReturnType<typeof useInterviewTime>; isSessionActive: boolean
  onPrepare: (input: EnvironmentInput) => Promise<void>; onSave: (input: EnvironmentInput) => Promise<void>
  onStarted: () => void; onContext: () => void; onSettings: () => void; onPurchase?: () => void
}
const emptyEnvironment: EnvironmentInput = { name: '', resumeId: null, targetId: null, referenceIds: [] }
function environmentInput({ id, name, resumeId, targetId, referenceIds, version }: InterviewEnvironment): EnvironmentInput { return { id, name, resumeId, targetId, referenceIds, version } }
/* v30 准备面试页:钱包页头 + 摘要卡 + 环境卡片网格,新建/编辑走弹窗(原「面试环境」页已并入) */
export default function InterviewPreparation({ bridge, settings, timer, isSessionActive, onPrepare, onSave, onStarted, onContext, onSettings, onPurchase }: Props) {
  const data = useInterviewLibrary(bridge)
  const records = data.library?.environments.map(environmentInput) ?? []
  const editor = useLibraryDraft<EnvironmentInput>(records, emptyEnvironment, Boolean(data.library), settings.interviewEnvironment?.id, 'environment-library')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InterviewEnvironment | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const activeId = data.library?.activeEnvironmentId
  const editingBlocked = editor.draft.id !== undefined && editor.draft.id === activeId && isSessionActive
  function openModal() { setNotice(''); setError(''); setDialogOpen(true) }
  function requestNew() { editor.request(() => { editor.replace(emptyEnvironment); openModal() }) }
  function requestEdit(environment: InterviewEnvironment) {
    if (environment.id === editor.draft.id) { openModal(); return }
    editor.request(() => { editor.replace(environmentInput(environment)); openModal() })
  }
  async function handleSave() {
    if (busy || editingBlocked || !editor.draft.name.trim()) return
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
  const count = data.library?.environments.length ?? 0
  return <section className="flex flex-1 flex-col p-8 max-[820px]:p-5" aria-labelledby="preparation-title">
    <header className="mb-8 flex items-center justify-between gap-5 max-[820px]:items-start max-[560px]:flex-wrap">
      <div>
        <Eyebrow>准备好之后再开始计时</Eyebrow>
        <h1 id="preparation-title" tabIndex={-1} className="mb-2 text-[28px] leading-[1.3] font-semibold tracking-[-0.04em] max-[820px]:text-2xl">准备面试</h1>
        <p className="text-xs text-text-muted">简历必填，岗位 JD 和参考资料选填。</p>
      </div>
      <div className="flex flex-col items-end gap-3 max-[560px]:items-start">
        {/* v30 .prep-wallet:标签次要小字,时长值 mono 蓝色强调(≤60s 转红),刷新钮 30px */}
        <div className="flex items-center gap-[9px]"><strong className="text-xs font-medium text-text-secondary">可用时长</strong><span className={cn('font-mono text-[13px] font-semibold tabular-nums text-accent-text', timer.remaining <= 60 && 'text-danger')}>{formatDuration(timer.remaining)}</span><RefreshTimeButton className="size-[30px] text-accent-text hover:bg-accent/10" refreshing={timer.refreshing} onRefresh={timer.refresh} /></div>
        {onPurchase && <Button onClick={onPurchase}>购买时长</Button>}
        <Button variant="primary" disabled={!data.library || busy} onClick={requestNew}><Plus size={18} aria-hidden="true" />新建面试准备</Button>
      </div>
    </header>
    {timer.wallet?.session?.status === 'ended' && <p className={cn(successNoticeClass, 'mt-0 mb-3')}>上次面试已结束 · 使用 {formatDuration(timer.wallet.session.usedSeconds)}。可前往会话记录查看回答。</p>}
    {(error || timer.error || data.error) && <p className={inlineErrorClass} role="alert">{error || timer.error || data.error}</p>}
    {data.error && <button type="button" className={textButtonClass} disabled={busy} onClick={() => void data.retry()}>重新读取环境资料</button>}
    {timer.wallet?.session?.status === 'active' && !timer.active && <p className={formNoteClass}>该账号已有正在进行的面试，请先在原窗口结束；异常关闭后最多等待 30 秒再开始。</p>}
    {isSessionActive && <p className="mb-5 rounded-chip border border-accent-line bg-accent-subtle px-4 py-3 text-xs leading-[1.8] text-text-secondary">正在转写或回答。停止后可进入其他环境或修改当前环境组合。</p>}
    {data.loading && <p className={formNoteClass} role="status">正在读取面试资料…</p>}
    {timer.wallet && timer.remaining === 0 && <p className={formNoteClass}>暂无可用时长，可前往「购买时长」选择套餐。</p>}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card p-[18px] max-[820px]:flex-col max-[820px]:items-start">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-text-heading">连接已就绪，随时可以开始</h2>
        <p className="mt-1.5 text-[11.5px] leading-[1.7] text-text-muted">点击开始后持续扣减面试时长，自带 Key 同样扣时。停止转写不会停止计时；面试结束请点击「结束面试」。</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary"><button type="button" className={cn(textButtonClass, 'text-accent-text')} onClick={onSettings}>模型与设置</button></div>
    </div>
    <div className="mb-3.5 mt-7 flex flex-wrap items-baseline gap-2.5">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-text-heading">我的面试准备</h2>
      <span aria-hidden="true" className="font-mono text-xs font-bold text-accent-text">{String(count).padStart(2, '0')}</span>
      <span className="ml-auto text-[11px] text-text-muted">每套准备独立选择资料</span>
    </div>
    {editor.pending && <DraftChangeNotice onKeep={editor.keepDraft} onDiscard={editor.discardAndContinue} />}
    {editor.restored && <p className="mb-4 text-xs leading-[1.85] text-text-secondary" role="status">已恢复尚未保存的环境草稿，保留到本次关闭应用前。保存环境后才会生效。</p>}
    {notice && <p className={cn(successNoticeClass, 'mt-0 mb-3')} role="status"><CheckCircle size={18} />{notice}</p>}
    {data.library && <ul aria-label="已保存面试环境" className="m-0 grid list-none grid-cols-4 gap-4 p-0 max-[1600px]:grid-cols-3 max-[950px]:grid-cols-2 max-[730px]:grid-cols-1">
      {data.library.environments.map(environment => {
        const resume = data.library?.resumes.find(item => item.id === environment.resumeId)
        const target = data.library?.targets.find(item => item.id === environment.targetId)
        const resumeReady = Boolean(resume?.hasContent ?? resume?.text.trim())
        const startBlocked = !resumeReady ? ('resume' as const) : !timer.wallet || timer.remaining <= 0 ? ('wallet' as const) : false
        return <li key={environment.id} className="min-w-0">
          <EnvironmentCard environment={environment} resume={resume} target={target} current={environment.id === activeId}
            resumeReady={resumeReady} startBlocked={startBlocked} busy={busy} timerActive={timer.active} sessionActive={isSessionActive}
            onEdit={() => requestEdit(environment)}
            onDelete={() => setDeleteTarget(environment)}
            onStart={() => void start(environment)} onReturn={onStarted} onContext={onContext} />
        </li>
      })}
      <li className="min-w-0">
        <button type="button" onClick={requestNew} disabled={!data.library || busy} className="flex min-h-[160px] w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border-dashed bg-card p-5 text-center text-text-muted transition-colors hover:border-accent hover:text-accent-text">
          <PlusCircle size={22} aria-hidden="true" />
          <span className="text-[13.5px] font-semibold text-text-secondary">为下一次机会做准备</span>
          <span className="text-[11.5px]">选择简历、岗位与参考资料</span>
        </button>
      </li>
    </ul>}
    <EnvironmentDialog open={dialogOpen} onOpenChange={setDialogOpen} draft={editor.draft} dirty={editor.dirty} library={data.library}
      references={data.references} referencesReady={data.referencesReady} settings={settings} busy={busy}
      editingBlocked={editingBlocked} error={error}
      onChange={editor.setDraft} onSave={() => void handleSave()} />
    <ConfirmModal open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) setDeleteTarget(null) }} title="删除环境" danger confirmText="确认删除"
      description={`将删除「${deleteTarget?.name.trim() || '未命名环境'}」，无法撤销。其中的简历、岗位和参考资料仍保留在资料库中。`}
      onConfirm={() => deleteTarget && void handleRemove(deleteTarget.id)} />
  </section>
}
