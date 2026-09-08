import { useState } from 'react'
import { CheckCircle, Plus } from '@phosphor-icons/react'
import type { DesktopBridge, EnvironmentInput, InterviewEnvironment, Settings } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import useInterviewLibrary from '../hooks/useInterviewLibrary'
import useLibraryDraft from '../hooks/useLibraryDraft'
import DraftChangeNotice from './DraftChangeNotice'
import EnvironmentEditor from './EnvironmentEditor'
import InterviewEnvironmentList from './InterviewEnvironmentList'
import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface InterviewEnvironmentsPageProps { settings: Settings; bridge: DesktopBridge | undefined; isSessionActive: boolean; onActivate: (id: string) => Promise<void>; onSave: (input: EnvironmentInput) => Promise<void> }
const emptyEnvironment: EnvironmentInput = { name: '', resumeId: null, targetId: null, referenceIds: [] }
function environmentInput({ id, name, resumeId, targetId, referenceIds }: InterviewEnvironment): EnvironmentInput { return { id, name, resumeId, targetId, referenceIds } }
export default function InterviewEnvironmentsPage({ settings, bridge, isSessionActive, onActivate, onSave }: InterviewEnvironmentsPageProps) {
  const data = useInterviewLibrary(bridge)
  const records = data.library?.environments.map(environmentInput) ?? []
  const editor = useLibraryDraft<EnvironmentInput>(records, emptyEnvironment, Boolean(data.library), settings.interviewEnvironment?.id, 'environment-library')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const current = editor.draft.id === data.library?.activeEnvironmentId
  const editingBlocked = current && isSessionActive
  function handleNew() { editor.request(() => { editor.replace(emptyEnvironment); setNotice('新环境尚未保存，简历、岗位和资料可按需选择。'); setError('') }) }
  function handleEdit(environment: InterviewEnvironment) { editor.request(() => { editor.replace(environmentInput(environment)); setNotice(''); setError('') }) }
  async function handleSave() {
    if (busy || editingBlocked || !bridge || !editor.draft.name.trim()) return
    setBusy(true); setError(''); setNotice('')
    const input = { ...editor.draft, name: editor.draft.name.trim() }
    try {
      await onSave(input)
      const next = await data.reload()
      const saved = next?.environments.find(record => input.id ? record.id === input.id : !records.some(previous => previous.id === record.id))
      editor.replace(saved ? environmentInput(saved) : input)
      setNotice(!next ? '环境已保存，但列表刷新失败。请重新读取后确认。' : current ? '当前环境已更新，旧会话已保存。下一次回答使用新的组合。' : '环境已保存，点击左侧「进入面试」后使用。')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleActivate(id: string) {
    if (busy || isSessionActive || !bridge) return
    setBusy(true); setError(''); setNotice('')
    try { await onActivate(id); await data.reload(); setNotice('已进入面试环境，上一会话已保存。') }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  async function handleRemove(id: string) {
    if (!bridge || busy) return
    setBusy(true); setError(''); setNotice('')
    try { data.acceptLibrary(await bridge.removeEnvironment(id)); if (editor.draft.id === id) editor.replace(emptyEnvironment); setNotice('环境已删除，简历、岗位和参考资料仍保留在库中。') }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  const actions = { onEdit: handleEdit, onActivate: (id: string) => editor.request(() => void handleActivate(id)), onRemove: (id: string) => editor.draft.id === id ? editor.request(() => void handleRemove(id)) : void handleRemove(id) }
  return <section className={styles.contextPage} aria-labelledby="environments-title">
    <header className={styles.pageHeading}><div><span className={styles.eyebrow}>按面试准备一套内容</span><h1 id="environments-title" tabIndex={-1}>面试环境</h1><p>每个环境分别选择简历、岗位和资料。进入环境时保存旧会话，开始新的对话。</p></div><button className={styles.primaryButton} disabled={!bridge || !data.library || busy} onClick={handleNew}><Plus size={18} />创建环境</button></header>
    {isSessionActive && <p className={libraryStyles.draftNotice}>正在转写或回答。停止后可进入其他环境或修改当前环境组合。</p>}
    {data.loading && <p className={styles.formNote} role="status">正在读取面试环境…</p>}
    {(error || data.error) && <p className={styles.inlineError} role="alert">{error || data.error}</p>}
    {data.error && <button className={styles.textButton} disabled={busy} onClick={() => void data.retry()}>重新读取环境资料</button>}
    {notice && <p className={styles.successNotice} role="status"><CheckCircle size={18} />{notice}</p>}
    {editor.pending && <DraftChangeNotice onKeep={editor.keepDraft} onDiscard={editor.discardAndContinue} />}
    {editor.restored && <p className={libraryStyles.libraryInfo} role="status">已恢复尚未保存的环境草稿，保留到本次关闭应用前。保存环境后才会生效。</p>}
    {data.library && <div className={libraryStyles.environmentLayout}><InterviewEnvironmentList library={data.library} references={data.references} selectedId={editor.draft.id} busy={busy} isSessionActive={isSessionActive} actions={actions} />
      <section className={libraryStyles.environmentForm} aria-labelledby="environment-editor-title"><h2 id="environment-editor-title">{editor.draft.id ? '编辑环境' : '创建环境'}</h2>
        <p className={libraryStyles.libraryInfo}>{current ? '保存当前环境组合会先保存会话并清空对话。当前环境需先切换到其他环境后才能删除。' : '保存后仍保留当前面试。准备就绪后，点击「进入面试」。'}</p>
        {settings.remoteKnowledge.enabled && <p className={libraryStyles.libraryInfo}>当前只检索百炼远程知识库，本地资料选择会保留。远程失败或没有结果时不自动回退本地；关闭远程后按本地设置恢复。</p>}
        {!settings.remoteKnowledge.enabled && !settings.retrieval.enabled && editor.draft.referenceIds.length > 0 && <p className={libraryStyles.libraryInfo}>本地资料检索已关闭，需在个人背景 → 参考资料开启后使用。当前选择会保留。</p>}
        {!data.referencesReady && <p className={styles.formNote} role="status">正在读取可选参考资料…</p>}
        <EnvironmentEditor draft={editor.draft} library={data.library} references={data.references} disabled={!bridge || busy || editingBlocked || !data.referencesReady} dirty={editor.dirty} onChange={editor.setDraft} onSave={() => void handleSave()} />
      </section></div>}
    {!bridge && <p className={libraryStyles.emptyState}>请在桌面应用中管理面试环境。</p>}
  </section>
}
