import { useState } from 'react'
import { Briefcase, CheckCircle, FileArrowUp, Plus } from '@phosphor-icons/react'
import type { DesktopBridge, InterviewLibrary, TargetInput } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import useLibraryDraft from '../hooks/useLibraryDraft'
import DraftChangeNotice from './DraftChangeNotice'
import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface InterviewTargetEditorProps { library: InterviewLibrary | null; bridge: DesktopBridge | undefined; onLibrary: (library: InterviewLibrary) => void; preferredId?: string | null }
const emptyTarget: TargetInput = { name: '', companyName: '', roleName: '', jobDescription: '' }
export default function InterviewTargetEditor({ library, bridge, onLibrary, preferredId }: InterviewTargetEditorProps) {
  const records = library?.targets.map(({ id, name, companyName, roleName, jobDescription }) => ({ id, name, companyName, roleName, jobDescription })) ?? []
  const editor = useLibraryDraft<TargetInput>(records, emptyTarget, Boolean(library), preferredId, 'target-library')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const target = editor.draft
  const exceedsLimit = target.jobDescription.length > 12000
  function handleField(field: keyof Omit<TargetInput, 'id'>, value: string) { editor.setDraft({ ...target, [field]: value }); setNotice('') }
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
      if (saved) editor.replace({ id: saved.id, name: saved.name, companyName: saved.companyName, roleName: saved.roleName, jobDescription: saved.jobDescription })
      setNotice('岗位 JD 已保存。使用这个岗位的环境会在下一次回答时采用新内容。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleRemove() {
    if (!bridge || !target.id || busy) return
    setBusy(true); setError(''); setNotice('')
    try { onLibrary(await bridge.removeTarget(target.id)); editor.replace(emptyTarget); setNotice('岗位已从资料库移除。') }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  return <div className={styles.contextLayout}><section className={styles.contextEditor} aria-labelledby="target-title">
    <header className={styles.sectionHeading}><div><h2 id="target-title">目标岗位</h2><p>为不同公司和岗位分别准备 JD。</p></div><button className={styles.secondaryButton} disabled={!bridge || busy || !library} onClick={() => editor.request(() => void handleImport())}><FileArrowUp size={18} />导入岗位 JD</button></header>
    <div className={libraryStyles.libraryToolbar}><label className={`${styles.field} ${libraryStyles.libraryChoice}`}>选择目标岗位<select value={target.id ?? ''} disabled={busy || !library} onChange={event => { const selected = records.find(record => record.id === event.target.value); editor.request(() => { editor.replace(selected ?? emptyTarget); setNotice(''); setError('') }) }}><option value="">新岗位草稿</option>{records.map(record => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
      <button className={styles.secondaryButton} disabled={!bridge || busy || !library} onClick={handleNew}><Plus size={16} />新增岗位</button></div>
    {editor.pending && <DraftChangeNotice onKeep={editor.keepDraft} onDiscard={editor.discardAndContinue} />}
    {editor.restored && <p className={libraryStyles.libraryInfo} role="status">已恢复尚未保存的岗位草稿，保留到本次关闭应用前。保存岗位 JD 后才会生效。</p>}
    {notice && <p className={styles.successNotice} role="status"><CheckCircle size={18} />{notice}</p>}{error && <p className={styles.inlineError} role="alert">{error}</p>}
    <label className={styles.field}>岗位方案名称<input value={target.name} maxLength={255} disabled={busy || !library} onChange={event => handleField('name', event.target.value)} placeholder="例如：公司 A · 后端工程师" /></label>
    <div className={styles.fieldRow}><label className={styles.field}>面试公司<input value={target.companyName} maxLength={200} disabled={busy || !library} onChange={event => handleField('companyName', event.target.value)} placeholder="公司名称" /></label>
      <label className={styles.field}>岗位名称<input value={target.roleName} maxLength={200} disabled={busy || !library} onChange={event => handleField('roleName', event.target.value)} placeholder="例如：高级后端开发工程师" /></label></div>
    <label className={styles.field}>岗位 JD<textarea className={styles.targetTextarea} value={target.jobDescription} disabled={busy || !library} aria-invalid={exceedsLimit} aria-describedby={exceedsLimit ? 'jd-length-error' : undefined} onChange={event => handleField('jobDescription', event.target.value)} placeholder="粘贴岗位职责、任职要求，以及你希望重点准备的内容…" /></label>
    <p className={styles.formNote}>{target.jobDescription.length.toLocaleString()} / 12,000 字符{editor.dirty ? ' · 尚未保存' : target.id ? ' · 已同步' : ' · 新草稿'}</p>
    {exceedsLimit && <p id="jd-length-error" className={styles.inlineError} role="alert">岗位 JD 超过 12,000 字符，请精简后保存。草稿已完整保留，已保存的版本不受影响。</p>}
    <footer className={styles.contextFooter}><button className={styles.textButton} disabled={!target.id || busy} onClick={() => editor.request(() => void handleRemove())}>删除岗位</button><div className={styles.actionGroup}>
      {editor.dirty && <button className={styles.textButton} disabled={busy} onClick={() => { editor.replace(records.find(record => record.id === target.id) ?? emptyTarget); setNotice('已还原为保存的岗位。'); setError('') }}>还原已保存岗位</button>}
      <button className={styles.primaryButton} disabled={!bridge || !library || busy || !editor.dirty || exceedsLimit || !target.name.trim()} onClick={() => void handleSave()}>{busy ? '保存中…' : '保存岗位 JD'}</button></div></footer>
  </section><aside className={styles.contextGuide}><Briefcase size={24} weight="duotone" /><h2>岗位要求，是表达重点</h2><p>保存的岗位可被多个面试环境使用。当前页编辑和选择岗位不会直接切换面试。</p><ol><li><strong>命名便于辨认</strong><span>例如公司名、岗位与面试轮次。</span></li><li><strong>只影响表达重点</strong><span>不会将 JD 的要求写成你的真实经历。</span></li><li><strong>保留当时目标</strong><span>已发起的回答和历史保持原始快照。</span></li></ol></aside></div>
}
