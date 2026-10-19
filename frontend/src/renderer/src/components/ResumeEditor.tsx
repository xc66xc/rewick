import { useState } from 'react'
import { CheckCircle, FileArrowUp, FileText, Plus } from '@phosphor-icons/react'
import type { DesktopBridge, InterviewLibrary, ResumeInput } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import useLibraryDraft from '../hooks/useLibraryDraft'
import DraftChangeNotice from './DraftChangeNotice'
import { Button, TextButton } from './ui/button'
import { StatusPill } from './ui/pill'
import { TextField, TextareaField } from './ui/field'
import { ConfirmModal } from './ui/dialog'
import { cn } from '../lib/cn'
import { formNoteClass, inlineErrorClass, successNoticeClass, contextFooterClass, textButtonClass } from '../lib/form'

interface ResumeEditorProps { library: InterviewLibrary | null; bridge: DesktopBridge | undefined; onLibrary: (library: InterviewLibrary) => void; preferredId?: string | null }
const emptyResume: ResumeInput = { name: '', text: '' }
function formatUpdatedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `更新于 ${date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}` }
export default function ResumeEditor({ library, bridge, onLibrary, preferredId }: ResumeEditorProps) {
  const records = library?.resumes.map(({ id, name, text, version, bodyLoaded }) => ({ id, name, text, version, bodyLoaded })) ?? []
  const editor = useLibraryDraft<ResumeInput>(records, emptyResume, Boolean(library), preferredId, 'resume-library', bridge?.getResume)
  const [saving, setBusy] = useState(false)
  const busy = saving || editor.loading
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const context = editor.draft
  function select(id: string) {
    const selected = records.find(record => record.id === id)
    editor.request(() => { editor.replace(selected ?? emptyResume); setNotice(''); setError('') })
  }
  function handleNew() { editor.request(() => { editor.replace(emptyResume); setNotice('填写名称和经历，保存后可在面试环境中选择。'); setError('') }) }
  async function handleImport() {
    if (!bridge || busy) return
    setBusy(true); setError(''); setNotice('')
    try { const imported = await bridge.importContext(); if (imported) { editor.setDraft({ ...context, ...imported }); setNotice('文件已提取到下方预览。请核对文字，保存背景后生效。') } }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleSave() {
    if (!bridge || busy || !context.name.trim()) return
    setBusy(true); setError(''); setNotice('')
    try {
      const next = await bridge.saveResume({ ...context, name: context.name.trim() })
      const saved = next.resumes.find(record => context.id ? record.id === context.id : !records.some(previous => previous.id === record.id))
      onLibrary(next)
      if (saved) editor.replace({ id: saved.id, version: saved.version, bodyLoaded: true, name: saved.name, text: saved.text })
      setNotice('简历已保存。使用这份简历的环境会在下一次开始面试时采用新内容。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleRemove() {
    if (!bridge || !context.id || busy) return
    setBusy(true); setError(''); setNotice('')
    try { onLibrary(await bridge.removeResume(context.id)); editor.replace(emptyResume); setNotice('简历已从资料库移除。') }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  /* v30 资料库布局:左列简历列表(选中灰块) + 底部虚线「新增简历」伪列表项,右侧编辑卡 + 原版右侧说明栏 */
  return <div className="grid h-full grid-cols-[270px_minmax(0,1fr)_240px] gap-5 max-[1060px]:grid-cols-[220px_minmax(0,1fr)_210px] max-[820px]:grid-cols-[minmax(0,1fr)]">
    <aside className="flex min-w-0 flex-col gap-1" aria-label="简历列表">
      {library?.resumes.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(record => {
        const active = context.id === record.id
        return <button key={record.id} type="button" onClick={() => select(record.id)} aria-current={active ? 'true' : undefined} title={record.name}
          className={cn('flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left transition-colors', active ? 'bg-border text-text-primary' : 'text-text-regular hover:bg-subtle')}>
          <FileText size={15} aria-hidden="true" className="shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-semibold">{record.name}</h3>{formatUpdatedAt(record.updatedAt) && <p className="mt-0.5 truncate text-[10.5px] text-text-muted">{formatUpdatedAt(record.updatedAt)}</p>}</span>
        </button>
      })}
      <button type="button" onClick={handleNew} disabled={!bridge || busy || !library}
        className="mt-2 flex w-full items-center gap-2.5 rounded-control border border-dashed border-accent-line bg-accent-subtle px-3 py-2.5 text-left text-[13px] font-medium text-accent-text transition-colors hover:border-accent hover:text-accent">
        <Plus size={15} weight="bold" aria-hidden="true" className="shrink-0" />新增简历
      </button>
    </aside>
    <section className="flex min-h-0 min-w-0 flex-col rounded-card border border-border bg-card p-6 max-[820px]:p-5" aria-labelledby="resume-title">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id="resume-title" className="min-w-0 truncate text-base font-semibold tracking-[-0.01em]">{context.id ? context.name || '未命名简历' : '新简历草稿'}</h2>
          <StatusPill status={editor.loading || editor.dirty ? 'busy' : context.id ? 'ready' : 'pending'}>{editor.loading ? '加载正文…' : editor.dirty ? '尚未保存' : context.id ? '已同步' : '草稿'}</StatusPill>
        </div>
        <Button onClick={() => editor.request(() => void handleImport())} disabled={!bridge || busy || !library}><FileArrowUp size={18} aria-hidden="true" />导入 PDF / TXT / MD</Button>
      </header>
      <p className="mb-3 text-xs leading-[1.8] text-text-secondary">分别保存不同方向的简历，再到面试环境中选择。</p>
      {editor.pending && <DraftChangeNotice onKeep={editor.keepDraft} onDiscard={editor.discardAndContinue} />}
      {editor.restored && <p className="mb-4 text-xs leading-[1.85] text-text-secondary" role="status">已恢复尚未保存的简历草稿，保留到本次关闭应用前。保存背景后才会生效。</p>}
      {notice && <p className={cn(successNoticeClass, 'mt-0 mb-4')} role="status"><CheckCircle size={18} />{notice}</p>}{error && <p className={cn(inlineErrorClass, 'mt-0 mb-4')} role="alert">{error}</p>}
      <TextField className="mb-4" label="资料名称" value={context.name} disabled={busy || !library} onChange={event => { editor.setDraft({ ...context, name: event.target.value }); setNotice('') }} placeholder="例如：后端开发 · 简历与项目经历" maxLength={255} />
      <TextareaField className="mb-4 min-h-0 flex-1" label="简历与项目说明" controlClassName="min-h-[180px] flex-1 text-xs" value={context.text} maxLength={100000} disabled={busy || !library} onChange={event => { editor.setDraft({ ...context, text: event.target.value }); setNotice('') }} placeholder={'粘贴或导入你的真实经历：\n\n个人简介、工作年限、主要技术方向\n\n项目背景、你的职责、技术选择和遇到的难题\n\n可以核实的成果、业务影响与经验总结'} />
      {context.text.length > 20000 && <p className={formNoteClass}>背景较长，会随每次回答发送。可将补充技术材料移到参考资料中。</p>}
      <p className={formNoteClass}>{context.text.length.toLocaleString()} / 100,000 字符{editor.dirty ? ' · 尚未保存' : context.id ? ' · 已同步' : ' · 新草稿'}</p>
      <footer className={contextFooterClass}><TextButton className="text-danger" disabled={!context.id || busy} onClick={() => setConfirmRemove(true)}>删除简历</TextButton><div className="flex flex-wrap items-center justify-end gap-3">
        {editor.dirty && <button className={textButtonClass} disabled={busy} onClick={() => { editor.replace(records.find(record => record.id === context.id) ?? emptyResume); setError(''); setNotice('已还原为保存的背景。') }}>还原已保存内容</button>}
        <Button variant="primary" disabled={!bridge || !library || busy || !editor.dirty || !context.name.trim()} onClick={() => void handleSave()}>{busy ? '处理中…' : '保存背景'}</Button></div></footer>
    </section>
    <aside className="rounded-card border border-border bg-card p-6 max-[820px]:hidden">
      <FileText size={24} weight="duotone" aria-hidden="true" className="text-text-muted" />
      <h2 className="mb-2 mt-3 text-base font-semibold tracking-[-0.01em]">维护资料，按场景选择</h2>
      <p className="text-[13px] leading-[1.85] text-text-regular">简历保存在资料库中。保存或选中简历不会替换当前面试环境的选择。</p>
      <ol className="my-6 flex flex-col gap-5">
        <li className="flex flex-col gap-1"><strong className="text-[13px] font-semibold">记录真实经历</strong><span className="text-xs leading-[1.7] text-text-secondary">写清职责、问题、取舍和实际结果。</span></li>
        <li className="flex flex-col gap-1"><strong className="text-[13px] font-semibold">按方向分别准备</strong><span className="text-xs leading-[1.7] text-text-secondary">同一段经历可以有不同表达重点。</span></li>
        <li className="flex flex-col gap-1"><strong className="text-[13px] font-semibold">先调整引用再删除</strong><span className="text-xs leading-[1.7] text-text-secondary">环境仍在使用的简历无法删除。</span></li>
      </ol>
      <p className="border-t border-border pt-4 text-xs leading-[1.7] text-text-muted">支持含文字的 PDF。多栏排版可能影响提取顺序，请在保存前检查；扫描件暂不支持。</p>
    </aside>
    <ConfirmModal open={confirmRemove} onOpenChange={setConfirmRemove} title="删除简历" danger confirmText="确认删除"
      description={`将删除「${context.name.trim() || '未命名简历'}」中的全部内容，无法撤销。仍被面试环境引用的简历无法删除。`}
      onConfirm={() => void handleRemove()} />
  </div>
}
