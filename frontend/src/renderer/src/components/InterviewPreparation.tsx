import { useEffect, useState } from 'react'
import type { DesktopBridge, EnvironmentInput, Settings } from '../../../shared/types'
import type { useInterviewTime } from '../hooks/useInterviewTime'
import { formatDuration } from '../hooks/useInterviewTime'
import useInterviewLibrary from '../hooks/useInterviewLibrary'
import { errorMessage } from '../hooks/useSettings'
import EnvironmentReferencePicker from './EnvironmentReferencePicker'
import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface Props {
  bridge: DesktopBridge; settings: Settings; timer: ReturnType<typeof useInterviewTime>
  onPrepare: (input: EnvironmentInput) => Promise<void>; onStarted: () => void; onContext: () => void; onSettings: () => void
}
export default function InterviewPreparation({ bridge, settings, timer, onPrepare, onStarted, onContext, onSettings }: Props) {
  const data = useInterviewLibrary(bridge)
  const [draft, setDraft] = useState<EnvironmentInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (data.library) setDraft(current => data.library?.environments.find(item => item.id === (current?.id ?? data.library?.activeEnvironmentId)) ?? null)
  }, [data.library])
  async function start() {
    if (!draft || busy) return
    setBusy(true); setError('')
    try { await onPrepare(draft); await timer.start(); onStarted() }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  const resume = data.library?.resumes.find(item => item.id === draft?.resumeId)
  const ready = Boolean(resume?.text.trim())
  return <section className={styles.contextPage}>
    <header className={styles.pageHeading}><div><span className={styles.eyebrow}>准备好之后再开始计时</span><h1 tabIndex={-1}>准备面试</h1><p>简历必填，岗位 JD 和参考资料选填。</p></div><div><strong>可用时长 {formatDuration(timer.remaining)}</strong><button className={styles.textButton} onClick={() => void timer.refresh()}>刷新时长</button></div></header>
    {timer.wallet?.session?.status === 'ended' && <p className={styles.successNotice}>上次面试已结束 · 使用 {formatDuration(timer.wallet.session.usedSeconds)}。可前往会话记录查看回答。</p>}
    {(error || timer.error || data.error) && <p className={styles.inlineError} role="alert">{error || timer.error || data.error}</p>}
    {timer.wallet?.session?.status === 'active' && !timer.active && <p className={styles.formNote}>该账号已有正在进行的面试，请先在原窗口结束；异常关闭后最多等待 30 秒再开始。</p>}
    {draft && data.library && <form onSubmit={event => { event.preventDefault(); void start() }}><fieldset className={libraryStyles.editorFields} disabled={busy || timer.busy}>
      <label className={styles.field}>使用已保存的面试环境<select value={draft.id ?? ''} onChange={event => setDraft(data.library?.environments.find(item => item.id === event.target.value) ?? null)}>{data.library.environments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className={styles.field}>本次简历（必填）<select required value={draft.resumeId ?? ''} onChange={event => setDraft({ ...draft, resumeId: event.target.value || null })}><option value="">请选择简历</option>{data.library.resumes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {!ready && <p className={styles.formNote}>请选择有正文内容的简历。<button type="button" className={styles.textButton} onClick={onContext}>填写或导入简历 PDF</button></p>}
      <label className={styles.field}>目标岗位 JD（选填）<select value={draft.targetId ?? ''} onChange={event => setDraft({ ...draft, targetId: event.target.value || null })}><option value="">不选择岗位 JD</option>{data.library.targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {settings.remoteKnowledge.enabled ? <p className={styles.formNote}>本次使用百炼远程知识库，不检索个人上传资料。</p> : <EnvironmentReferencePicker documents={data.references} selected={draft.referenceIds} disabled={!data.referencesReady} onChange={referenceIds => setDraft({ ...draft, referenceIds })} />}
      <p className={styles.formNote}>回答模型：{settings.llm.model} · <button type="button" className={styles.textButton} onClick={onSettings}>模型与设置</button></p>
      <p className={styles.formNote}>点击开始后持续扣减面试时长，自带 Key 同样扣时。停止转写不会停止计时；面试结束请点击「结束面试」。</p>
      <footer className={styles.contextFooter}><button className={styles.primaryButton} type="submit" disabled={!ready || !timer.wallet || timer.remaining <= 0 || busy}>{busy ? '正在准备…' : '开始面试'}</button></footer>
    </fieldset></form>}
    {data.loading && <p role="status">正在读取面试资料…</p>}
    {timer.wallet && timer.remaining === 0 && <p className={styles.formNote}>暂无可用时长，请联系管理员分配。</p>}
  </section>
}
