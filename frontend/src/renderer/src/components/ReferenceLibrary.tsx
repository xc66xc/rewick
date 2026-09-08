import { useEffect, useRef, useState } from 'react'
import { Books, CheckCircle, FileArrowUp } from '@phosphor-icons/react'
import type { DesktopBridge, ReferenceDocument, ReferenceKind, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from '../hooks/useSettings'
import ReferenceDocumentRow from './ReferenceDocumentRow'
import ReferencePreviewDialog from './ReferencePreviewDialog'
import styles from '../styles/App.module.css'

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
    return () => { active.current = false; sequence.current++; unsubscribe?.() }
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
    try { await bridge.removeReference(id); if (active.current) { setNotice('已从资料库移除，原文件和历史回答不受影响。'); await reload() } }
    catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally { if (active.current) setRemoving(current => { const next = new Set(current); next.delete(id); return next }) }
  }
  function handleEnabled(enabled: boolean) { void perform(() => onSave({ ...settingsInput(settings), retrieval: { enabled } })) }
  const readyCount = documents.filter(document => document.enabled && document.status === 'ready').length
  const embeddingReady = settings.embedding.hasApiKey || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/.test(settings.embedding.baseUrl)
  return <section className={styles.referenceLibrary} aria-labelledby="references-title">
    <header className={styles.sectionHeading}><div><h2 id="references-title">参考资料</h2><p>导入技术材料或你的项目经历，回答时只参考相关片段。</p></div>
      <button className={styles.secondaryButton} disabled={!bridge || importBusy} onClick={() => void handleImport()}><FileArrowUp size={18} weight="bold" />导入参考资料</button></header>
    <div className={styles.referenceToolbar}><label className={styles.referenceGlobalToggle}><input type="checkbox" role="switch" aria-label="使用参考资料" checked={settings.retrieval.enabled} disabled={!bridge || busy} onChange={event => handleEnabled(event.target.checked)} />使用参考资料</label>
      <span>{readyCount} 份已启用且可用 · 共 {documents.length} 份</span></div>
    {settings.remoteKnowledge.enabled && <p className={styles.formNote} role="status">当前只检索百炼远程知识库，本地检索已暂停。这里的开关和环境选择会保留，关闭远程知识库后按这些设置恢复。</p>}
    <div className={styles.referenceDisclosure}><p>文件在本机提取文字。建立索引会将资料片段发送到配置的向量服务；本地检索生效时，相关片段会发送到回答模型。</p>
      <p>{embeddingReady ? `向量模型：${settings.embedding.model} · ${settings.embedding.baseUrl}` : '尚未配置向量接口：可以先导入和预览，请到设置中填写独立的向量 API Key 后重建索引。'}</p></div>
    <p className={styles.formNote}>此开关控制本地参考资料，在百炼远程知识库关闭时生效。远程开启时不会使用本地检索，简历和岗位 JD 仍照常提供。「技术参考」帮助解释知识，仅将亲自参与的材料标为「我的项目经历」。</p>
    {error && <p className={styles.inlineError} role="alert">{error}</p>}{notice && <p className={styles.successNotice} role="status"><CheckCircle size={18} />{notice}</p>}
    {loading && <p className={styles.formNote} role="status">正在读取资料库…</p>}
    {importBusy && <p className={styles.formNote} role="status">正在导入资料，已出现的资料可以预览或移除。</p>}
    {documents.length ? <div className={styles.referenceList}>{documents.map(document => <ReferenceDocumentRow key={document.id} document={document} busy={documentBusy.has(document.id)} removing={removing.has(document.id)} onPreview={setPreview} onUpdate={handleUpdate} onReindex={handleReindex} onRemove={id => void handleRemove(id)} />)}</div>
      : !loading && <div className={styles.referenceEmpty}><Books size={36} weight="duotone" /><h3>为回答准备一些参考</h3><p>支持含文字的 PDF、TXT、MD，可一次选择多份。<br />未配置向量接口时，资料会保留为待处理状态。</p></div>}
    <p className={styles.formNote}>关闭百炼远程知识库后，本地检索按此开关恢复，只使用当前环境中已勾选、已启用且可用的资料。新增本地资料后请到面试环境中选择；这里的选择和移除不改变远程 Agent 的范围，也不改变历史回答和摘录。</p>
    {preview && bridge && <ReferencePreviewDialog document={preview} bridge={bridge} onClose={() => setPreview(null)} />}
  </section>
}
