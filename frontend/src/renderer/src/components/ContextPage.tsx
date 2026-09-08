import { useRef, useState, type KeyboardEvent } from 'react'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'
import ResumeEditor from './ResumeEditor'
import InterviewTargetEditor from './InterviewTargetEditor'
import ReferenceLibrary from './ReferenceLibrary'
import useInterviewLibrary from '../hooks/useInterviewLibrary'
import styles from '../styles/App.module.css'

interface ContextPageProps {
  settings: Settings
  bridge: DesktopBridge | undefined
  onSave: (input: SettingsInput) => Promise<Settings>
}
const tabs = [{ id: 'resume', label: '我的简历' }, { id: 'target', label: '目标岗位' }, { id: 'references', label: '参考资料' }] as const
type ContextTab = (typeof tabs)[number]['id']
export default function ContextPage({ settings, bridge, onSave }: ContextPageProps) {
  const library = useInterviewLibrary(bridge)
  const [activeTab, setActiveTab] = useState<ContextTab>('resume')
  const navigation = useRef<HTMLDivElement>(null)
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!offset && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length
    setActiveTab(tabs[next].id)
    navigation.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
  return <section className={styles.contextPage} aria-labelledby="context-title">
    <header className={styles.pageHeading}><div><span className={styles.eyebrow}>让每次回答都有依据</span><h1 id="context-title" tabIndex={-1}>个人背景</h1><p>维护多份简历、岗位和参考资料，在面试环境中组合使用。</p></div></header>
    {library.loading && <p className={styles.formNote} role="status">正在读取背景资料库…</p>}
    {library.error && <p className={styles.inlineError} role="alert">{library.error}</p>}
    {library.error && <button className={styles.textButton} onClick={() => void library.retry()}>重新读取背景资料</button>}
    <div className={styles.contextTabs} ref={navigation} role="tablist" aria-label="个人背景分类">
      {tabs.map((tab, index) => <button key={tab.id} id={`context-tab-${tab.id}`} role="tab" type="button" aria-selected={activeTab === tab.id}
        aria-controls={`context-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => handleTabKey(event, index)}>{tab.label}</button>)}
    </div>
    <div id="context-panel-resume" role="tabpanel" aria-labelledby="context-tab-resume" hidden={activeTab !== 'resume'}><ResumeEditor library={library.library} bridge={bridge} onLibrary={library.acceptLibrary} preferredId={settings.interviewEnvironment?.resumeId} /></div>
    <div id="context-panel-target" role="tabpanel" aria-labelledby="context-tab-target" hidden={activeTab !== 'target'}><InterviewTargetEditor library={library.library} bridge={bridge} onLibrary={library.acceptLibrary} preferredId={settings.interviewEnvironment?.targetId} /></div>
    <div id="context-panel-references" role="tabpanel" aria-labelledby="context-tab-references" hidden={activeTab !== 'references'}><ReferenceLibrary settings={settings} bridge={bridge} onSave={onSave} /></div>
  </section>
}
