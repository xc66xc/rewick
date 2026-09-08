import { useState } from 'react'
import { CheckCircle, FileArrowUp, FileText, Plus } from '@phosphor-icons/react'
import type { DesktopBridge, InterviewLibrary, ResumeInput } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import useLibraryDraft from '../hooks/useLibraryDraft'
import DraftChangeNotice from './DraftChangeNotice'
import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface ResumeEditorProps { library: InterviewLibrary | null; bridge: DesktopBridge | undefined; onLibrary: (library: InterviewLibrary) => void; preferredId?: string | null }
const emptyResume: ResumeInput = { name: '', text: '' }
export default function ResumeEditor({ library, bridge, onLibrary, preferredId }: ResumeEditorProps) {
  const records = library?.resumes.map(({ id, name, text }) => ({ id, name, text })) ?? []
  const editor = useLibraryDraft<ResumeInput>(records, emptyResume, Boolean(library), preferredId, 'resume-library')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const context = editor.draft
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
      if (saved) editor.replace({ id: saved.id, name: saved.name, text: saved.text })
      setNotice('简历已保存。使用这份简历的环境会在下一次回答时采用新内容。')
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
  return <div className={styles.contextLayout}><section className={styles.contextEditor} aria-labelledby="resume-title">
    <header className={styles.sectionHeading}><div><h2 id="resume-title">我的简历</h2><p>分别保存不同方向的简历，再到面试环境中选择。</p></div><button className={styles.secondaryButton} onClick={() => editor.request(() => void handleImport())} disabled={!bridge || busy || !library}><FileArrowUp size={18} weight="bold" />导入 PDF / TXT / MD</button></header>
    <div className={libraryStyles.libraryToolbar}><label className={`${styles.field} ${libraryStyles.libraryChoice}`}>选择简历<select value={context.id ?? ''} disabled={busy || !library} onChange={event => { const selected = records.find(record => record.id === event.target.value); editor.request(() => { editor.replace(selected ?? emptyResume); setNotice(''); setError('') }) }}><option value="">新简历草稿</option>{records.map(record => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
      <button className={styles.secondaryButton} disabled={!bridge || busy || !library} onClick={handleNew}><Plus size={16} />新增简历</button></div>
    {editor.pending && <DraftChangeNotice onKeep={editor.keepDraft} onDiscard={editor.discardAndContinue} />}
    {editor.restored && <p className={libraryStyles.libraryInfo} role="status">已恢复尚未保存的简历草稿，保留到本次关闭应用前。保存背景后才会生效。</p>}
    {notice && <p className={styles.successNotice} role="status"><CheckCircle size={18} />{notice}</p>}{error && <p className={styles.inlineError} role="alert">{error}</p>}
    <label className={styles.field}>资料名称<input value={context.name} disabled={busy || !library} onChange={event => { editor.setDraft({ ...context, name: event.target.value }); setNotice('') }} placeholder="例如：后端开发 · 简历与项目经历" maxLength={255} /></label>
    <label className={styles.field}>简历与项目说明<textarea className={styles.contextTextarea} value={context.text} maxLength={100000} disabled={busy || !library} onChange={event => { editor.setDraft({ ...context, text: event.target.value }); setNotice('') }} placeholder={'粘贴或导入你的真实经历：\n\n个人简介、工作年限、主要技术方向\n\n项目背景、你的职责、技术选择和遇到的难题\n\n可以核实的成果、业务影响与经验总结'} /></label>
    {context.text.length > 20000 && <p className={styles.formNote}>背景较长，会随每次回答发送。可将补充技术材料移到参考资料中。</p>}
    <p className={styles.formNote}>{context.text.length.toLocaleString()} / 100,000 字符{editor.dirty ? ' · 尚未保存' : context.id ? ' · 已同步' : ' · 新草稿'}</p>
    <footer className={styles.contextFooter}><button className={styles.textButton} disabled={!context.id || busy} onClick={() => editor.request(() => void handleRemove())}>删除简历</button><div className={styles.actionGroup}>
      {editor.dirty && <button className={styles.textButton} disabled={busy} onClick={() => { editor.replace(records.find(record => record.id === context.id) ?? emptyResume); setError(''); setNotice('已还原为保存的背景。') }}>还原已保存内容</button>}
      <button className={styles.primaryButton} disabled={!bridge || !library || busy || !editor.dirty || !context.name.trim()} onClick={() => void handleSave()}>{busy ? '处理中…' : '保存背景'}</button></div></footer>
  </section><aside className={styles.contextGuide}><FileText size={24} weight="duotone" /><h2>维护资料，按场景选择</h2><p>简历保存在资料库中。保存或选中简历不会替换当前面试环境的选择。</p><ol><li><strong>记录真实经历</strong><span>写清职责、问题、取舍和实际结果。</span></li><li><strong>按方向分别准备</strong><span>同一段经历可以有不同表达重点。</span></li><li><strong>先调整引用再删除</strong><span>环境仍在使用的简历无法删除。</span></li></ol><p className={styles.guideFoot}>支持含文字的 PDF。多栏排版可能影响提取顺序，请在保存前检查；扫描件暂不支持。</p></aside></div>
}
