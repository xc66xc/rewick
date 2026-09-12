import { useState } from 'react'
import { Briefcase, CheckCircle, FileArrowUp, Plus } from '@phosphor-icons/react'
import type { DesktopBridge, InterviewLibrary, TargetInput } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import useLibraryDraft from '../hooks/useLibraryDraft'
import DraftChangeNotice from './DraftChangeNotice'
import { Button, TextButton } from './ui/button'
import { StatusPill } from './ui/pill'
import { FieldRow, TextField, TextareaField } from './ui/field'
import { ConfirmModal } from './ui/dialog'
import { cn } from '../lib/cn'
import { formNoteClass, inlineErrorClass, successNoticeClass, contextFooterClass, textButtonClass } from '../lib/form'

interface InterviewTargetEditorProps { library: InterviewLibrary | null; bridge: DesktopBridge | undefined; onLibrary: (library: InterviewLibrary) => void; preferredId?: string | null }
const emptyTarget: TargetInput = { name: '', companyName: '', roleName: '', jobDescription: '' }
function formatUpdatedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `更新于 ${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}` }
export default function InterviewTargetEditor({ library, bridge, onLibrary, preferredId }: InterviewTargetEditorProps) {
  const records = library?.targets.map(({ id, name, companyName, roleName, jobDescription, version, bodyLoaded }) => ({ id, name, companyName, roleName, jobDescription, version, bodyLoaded })) ?? []
  const editor = useLibraryDraft<TargetInput>(records, emptyTarget, Boolean(library), preferredId, 'target-library', bridge?.getTarget)
  const [saving, setBusy] = useState(false)
  const busy = saving || editor.loading
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const target = editor.draft
  const exceedsLimit = target.jobDescription.length > 12000
  function select(id: string) {
    const selected = records.find(record => record.id === id)
    editor.request(() => { editor.replace(selected ?? emptyTarget); setNotice(''); setError('') })
  }
  function handleField(field: keyof Omit<TargetInput, 'id' | 'version' | 'bodyLoaded'>, value: string) { editor.setDraft({ ...target, [field]: value }); setNotice('') }
  function handleNew() { editor.request(() => { editor.replace(emptyTarget); setNotice('命名并保存岗位，再到面试环境中选择。'); setError('') }) }
  async function handleImport() {
    if (!bridge || busy) return
    setBusy(true); setError(''); setNotice('')
    try { const imported = await bridge.importTarget(); if (imported) { const saved = records.find(record => record.id === target.id) ?? emptyTarget; editor.setDraft({ ...saved, name: imported.name, jobDescription: imported.text }); setNotice('岗位文件已提取为草稿，请核对公司、岗位和 JD 后保存。') } }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleSave() {
    if (!bridge || busy || exceedsLimit || !target.name.trim()) return
    setBusy(true); setNotice(''); setError('')
    try {
      const next = await bridge.saveTarget({ ...target, name: target.name.trim(), companyName: target.companyName.trim(), roleName: target.roleName.trim() })
      const saved = next.targets.find(record => target.id ? record.id === target.id : !records.some(previous => previous.id === record.id))
      onLibrary(next)
      if (saved) editor.replace({ id: saved.id, version: saved.version, bodyLoaded: true, name: saved.name, companyName: saved.companyName, roleName: saved.roleName, jobDescription: saved.jobDescription })
      setNotice('岗位 JD 已保存。使用这个岗位的环境会在下一次开始面试时采用新内容。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleRemove() {
    if (!bridge || !target.id || busy) return
    setBusy(true); setNotice(''); setError('')
    try { onLibrary(await bridge.removeTarget(target.id)); editor.replace(emptyTarget); setNotice('岗位已从资料库移除。') }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  /* v30 资料库布局(同我的简历):左列岗位列表 + 底部虚线「新增岗位」,右侧编辑卡 + 原版右侧说明栏 */
  return <div className="grid h-full grid-cols-[270px_minmax(0,1fr)_240px] gap-5 max-[1060px]:grid-cols-[220px_minmax(0,1fr)_210px] max-[820px]:grid-cols-[minmax(0,1fr)]">
    <aside className="flex min-w-0 flex-col gap-1" aria-label="岗位列表">
      {library?.targets.map(record => {
        const active = target.id === record.id
        return <button key={record.id} type="button" onClick={() => select(record.id)} aria-current={active ? 'true' : undefined} title={record.name}
          className={cn('flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left transition-colors', active ? 'bg-border text-text-primary' : 'text-text-regular hover:bg-subtle')}>
          <Briefcase size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-semibold">{record.name}</h3>{formatUpdatedAt(record.updatedAt) && <p className="mt-0.5 truncate text-[10.5px] text-text-muted">{formatUpdatedAt(record.updatedAt)}</p>}</span>
        </button>
      })}
      <button type="button" onClick={handleNew} disabled={!bridge || busy || !library}
        className="mt-2 flex w-full items-center gap-2.5 rounded-control border border-dashed border-accent-line bg-accent-subtle px-3 py-2.5 text-left text-[13px] font-medium text-accent-text transition-colors hover:border-accent hover:text-accent">
        <Plus size={15} weight="bold" aria-hidden="true" className="shrink-0" />新增岗位
      </button>
    </aside>
    <section className="flex min-h-0 min-w-0 flex-col rounded-card border border-border bg-card p-6 max-[820px]:p-5" aria-labelledby="target-title">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id="target-title" className="min-w-0 truncate text-base font-semibold tracking-[-0.01em]">{target.id ? target.name || '未命名岗位' : '新岗位草稿'}</h2>
          <StatusPill status={editor.loading || editor.dirty ? 'busy' : target.id ? 'ready' : 'pending'}>{editor.loading ? '加载正文…' : editor.dirty ? '尚未保存' : target.id ? '已同步' : '草稿'}</StatusPill>
        </div>
        <Button onClick={() => editor.request(() => void handleImport())} disabled={!bridge || busy || !library}><FileArrowUp size={18} aria-hidden="true" />导入岗位 JD</Button>
      </header>
      <p className="mb-3 text-xs leading-[1.8] text-text-secondary">为不同公司和岗位分别准备 JD。</p>
      {editor.pending && <DraftChangeNotice onKeep={editor.keepDraft} onDiscard={editor.discardAndContinue} />}
      {editor.restored && <p className="mb-4 text-xs leading-[1.85] text-text-secondary" role="status">已恢复尚未保存的岗位草稿，保留到本次关闭应用前。保存岗位 JD 后才会生效。</p>}
      {notice && <p className={cn(successNoticeClass, 'mt-0 mb-4')} role="status"><CheckCircle size={18} />{notice}</p>}{error && <p className={cn(inlineErrorClass, 'mt-0 mb-4')} role="alert">{error}</p>}
      <TextField className="mb-4" label="岗位方案名称" value={target.name} maxLength={255} disabled={busy || !library} onChange={event => handleField('name', event.target.value)} placeholder="例如：公司 A · 后端工程师" />
      <FieldRow className="mb-4 max-[560px]:grid-cols-[minmax(0,1fr)]"><TextField label="面试公司" value={target.companyName} maxLength={200} disabled={busy || !library} onChange={event => handleField('companyName', event.target.value)} placeholder="公司名称" />
        <TextField label="岗位名称" value={target.roleName} maxLength={200} disabled={busy || !library} onChange={event => handleField('roleName', event.target.value)} placeholder="例如：高级后端开发工程师" /></FieldRow>
      <TextareaField className="mb-4 min-h-0 flex-1" label="岗位 JD" controlClassName="min-h-[180px] flex-1 text-xs leading-[1.9]" value={target.jobDescription} disabled={busy || !library} aria-invalid={exceedsLimit} aria-describedby={exceedsLimit ? 'jd-length-error' : undefined} onChange={event => handleField('jobDescription', event.target.value)} placeholder="粘贴岗位职责、任职要求，以及你希望重点准备的内容…" />
      <p className={formNoteClass}>{target.jobDescription.length.toLocaleString()} / 12,000 字符{editor.dirty ? ' · 尚未保存' : target.id ? ' · 已同步' : ' · 新草稿'}</p>
      {exceedsLimit && <p id="jd-length-error" className={`${inlineErrorClass} mb-4`} role="alert">岗位 JD 超过 12,000 字符，请精简后保存。草稿已完整保留，已保存的版本不受影响。</p>}
      <footer className={contextFooterClass}><TextButton className="text-danger" disabled={!target.id || busy} onClick={() => setConfirmRemove(true)}>删除岗位</TextButton><div className="flex flex-wrap items-center justify-end gap-3">
        {editor.dirty && <button className={textButtonClass} disabled={busy} onClick={() => { editor.replace(records.find(record => record.id === target.id) ?? emptyTarget); setNotice('已还原为保存的岗位。'); setError('') }}>还原已保存岗位</button>}
        <Button variant="primary" disabled={!bridge || !library || busy || !editor.dirty || exceedsLimit || !target.name.trim()} onClick={() => void handleSave()}>{busy ? '保存中…' : '保存岗位 JD'}</Button></div></footer>
    </section>
    <aside className="rounded-card border border-border bg-card p-6 max-[820px]:hidden">
      <Briefcase size={24} weight="duotone" aria-hidden="true" className="text-text-muted" />
      <h2 className="mb-2 mt-3 text-base font-semibold tracking-[-0.01em]">岗位要求，是表达重点</h2>
      <p className="text-[13px] leading-[1.85] text-text-regular">保存的岗位可被多个面试环境使用。当前页编辑和选择岗位不会直接切换面试。</p>
      <ol className="my-6 flex flex-col gap-5">
        <li className="flex flex-col gap-1"><strong className="text-[13px] font-semibold">命名便于辨认</strong><span className="text-xs leading-[1.7] text-text-secondary">例如公司名、岗位与面试轮次。</span></li>
        <li className="flex flex-col gap-1"><strong className="text-[13px] font-semibold">只影响表达重点</strong><span className="text-xs leading-[1.7] text-text-secondary">不会将 JD 的要求写成你的真实经历。</span></li>
        <li className="flex flex-col gap-1"><strong className="text-[13px] font-semibold">保留当时目标</strong><span className="text-xs leading-[1.7] text-text-secondary">已发起的回答和历史保持原始快照。</span></li>
      </ol>
    </aside>
    <ConfirmModal open={confirmRemove} onOpenChange={setConfirmRemove} title="删除岗位" danger confirmText="确认删除"
      description={`将删除「${target.name.trim() || '未命名岗位'}」，无法撤销。仍被面试环境引用的岗位无法删除。`}
      onConfirm={() => void handleRemove()} />
  </div>
}
