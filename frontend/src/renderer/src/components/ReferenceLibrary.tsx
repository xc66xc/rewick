import { useEffect, useRef, useState } from 'react'
import { Books, CheckCircle, FileArrowUp } from '@phosphor-icons/react'
import type { DesktopBridge, ReferenceDocument, ReferenceKind, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from '../hooks/useSettings'
import ReferenceDocumentRow from './ReferenceDocumentRow'
import ReferencePreviewDialog from './ReferencePreviewDialog'
import { Button } from './ui/button'
import { EmptyState } from './ui/empty-state'
import { ToggleSwitch } from './ui/switch'
import { formNoteClass, inlineErrorClass, successNoticeClass } from '../lib/form'

interface ReferenceLibraryProps { settings: Settings; bridge: DesktopBridge | undefined; onSave: (input: SettingsInput) => Promise<Settings> }
export default function ReferenceLibrary({ settings, bridge, onSave }: ReferenceLibraryProps) {
  const [documents, setDocuments] = useState<ReferenceDocument[]>([])
  const [loading, setLoading] = useState(Boolean(bridge))
  const [busy, setBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [documentBusy, setDocumentBusy] = useState<Set<string>>(() => new Set())
  const [removing, setRemoving] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<ReferenceDocument | null>(null)
  const sequence = useRef(0)
  const active = useRef(true)
  async function reload() {
    if (!bridge) return
    const request = ++sequence.current
    try { const records = await bridge.listReferences(); if (active.current && request === sequence.current) setDocuments(records) }
    catch (reason) { if (active.current && request === sequence.current) setError(errorMessage(reason)) }
    finally { if (active.current && request === sequence.current) setLoading(false) }
  }
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => {
    active.current = true
    void reloadRef.current()
    const unsubscribe = bridge?.onEvent(event => { if (event.kind === 'documents-changed') void reloadRef.current() })
    const timer = setInterval(() => void reloadRef.current(), 3000)
    return () => { active.current = false; sequence.current++; unsubscribe?.(); clearInterval(timer) }
  }, [bridge])
  async function perform(action: () => Promise<unknown>, message?: string) {
    if (!bridge || busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action(); if (active.current) { if (message) setNotice(message); await reload() } }
    catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally { if (active.current) setBusy(false) }
  }
  async function performDocument(id: string, action: () => Promise<void>, message?: string) {
    if (documentBusy.has(id) || removing.has(id)) return
    setDocumentBusy(current => new Set(current).add(id)); setError('')
    try { await action(); if (active.current) { if (message) setNotice(message); await reload() } }
    catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally { if (active.current) setDocumentBusy(current => { const next = new Set(current); next.delete(id); return next }) }
  }
  async function handleImport() {
    if (!bridge || importBusy) return
    setImportBusy(true); setError(''); setNotice('')
    try { await bridge.importReferences(); if (active.current) await reload() }
    catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally { if (active.current) setImportBusy(false) }
  }
  function handleUpdate(id: string, patch: { enabled?: boolean; kind?: ReferenceKind }) { if (bridge) void performDocument(id, () => bridge.updateReference(id, patch)) }
  function handleReindex(id: string) { if (bridge) void performDocument(id, () => bridge.reindexReference(id), '索引任务已提交，请查看处理状态。') }
  async function handleRemove(id: string) {
    if (!bridge || removing.has(id)) return
    setRemoving(current => new Set(current).add(id)); setError('')
    try { await bridge.removeReference(id); if (active.current) { setNotice('已从资料库移除，本机原文件和历史回答不受影响。'); await reload() } }
    catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally { if (active.current) setRemoving(current => { const next = new Set(current); next.delete(id); return next }) }
  }
  function handleEnabled(enabled: boolean) { void perform(() => onSave({ ...settingsInput(settings), retrieval: { enabled } })) }
  const readyCount = documents.filter(document => document.enabled && document.status === 'ready').length
  return <section className="rounded-card border border-border bg-card p-6 max-[560px]:p-4" aria-labelledby="references-title">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 id="references-title" className="mb-1 text-base font-semibold tracking-[-0.02em]">参考资料</h2><p className="max-w-[520px] text-xs leading-[1.8] text-text-secondary">导入技术材料或你的项目经历，回答时只参考相关片段。</p></div>
      <Button disabled={!bridge || importBusy} onClick={() => void handleImport()}><FileArrowUp size={18} aria-hidden="true" />导入参考资料</Button></header>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-chip border border-border bg-subtle px-4 py-3"><ToggleSwitch checked={settings.retrieval.enabled} disabled={!bridge || busy} onCheckedChange={handleEnabled} label="使用参考资料" />
      <span className="text-xs text-text-secondary">{readyCount} 份已启用且可用 · 共 {documents.length} 份</span></div>
    {error && <p className={inlineErrorClass} role="alert">{error}</p>}{notice && <p className={successNoticeClass} role="status"><CheckCircle size={18} />{notice}</p>}
    {loading && <p className={formNoteClass} role="status">正在读取资料库…</p>}
    {importBusy && <p className={formNoteClass} role="status">正在导入资料，已出现的资料可以预览或移除。</p>}
    {documents.length ? <div className="mt-5 mb-4 overflow-hidden rounded-chip border border-border">{documents.map(document => <ReferenceDocumentRow key={document.id} document={document} busy={documentBusy.has(document.id)} removing={removing.has(document.id)} onPreview={setPreview} onUpdate={handleUpdate} onReindex={handleReindex} onRemove={id => void handleRemove(id)} />)}</div>
      : !loading && <EmptyState icon={<Books weight="duotone" />} title="为回答准备一些参考" description={<span>支持 Markdown 和 Word（MD、DOC、DOCX），可一次选择多份。<br />每份不超过 10 MB，数量和总容量以平台配额为准。</span>} className="my-5 rounded-chip border border-dashed border-border-strong" />}
    {preview && bridge && <ReferencePreviewDialog document={preview} bridge={bridge} onClose={() => setPreview(null)} />}
  </section>
}
