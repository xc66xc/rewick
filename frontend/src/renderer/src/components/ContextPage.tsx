import { useState } from 'react'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'
import ResumeEditor from './ResumeEditor'
import InterviewTargetEditor from './InterviewTargetEditor'
import ReferenceLibrary from './ReferenceLibrary'
import useInterviewLibrary from '../hooks/useInterviewLibrary'
import { TabBar } from './ui/tabs'
import { Eyebrow } from './ui/pill'
import { formNoteClass, inlineErrorClass, textButtonClass } from '../lib/form'

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
  return <section className="flex flex-1 flex-col p-8 max-[820px]:p-5" aria-labelledby="context-title">
    <header className="mb-8 flex items-center justify-between gap-5 max-[820px]:items-start max-[560px]:flex-wrap"><div><Eyebrow>让每次回答都有依据</Eyebrow><h1 id="context-title" tabIndex={-1} className="mb-2 text-[28px] leading-[1.3] font-semibold tracking-[-0.04em] max-[820px]:text-2xl">个人背景</h1><p className="text-xs text-text-muted">维护多份简历、岗位和参考资料，在面试环境中组合使用。</p></div></header>
    {library.loading && <p className={formNoteClass} role="status">正在读取背景资料库…</p>}
    {library.error && <p className={inlineErrorClass} role="alert">{library.error}</p>}
    {library.error && <button className={textButtonClass} onClick={() => void library.retry()}>重新读取背景资料</button>}
    <TabBar aria-label="个人背景分类" value={activeTab} onValueChange={value => setActiveTab(value as ContextTab)}
      items={tabs.map(tab => ({ value: tab.id, label: tab.label, id: `context-tab-${tab.id}` }))} />
    {/* 面板占满剩余高度:编辑页内部弹性收缩避免整页滚动,列表页在面板内滚动 */}
    <div id="context-panel-resume" role="tabpanel" aria-labelledby="context-tab-resume" className="min-h-0 flex-1 overflow-y-auto" hidden={activeTab !== 'resume'}><ResumeEditor library={library.library} bridge={bridge} onLibrary={library.acceptLibrary} preferredId={settings.interviewEnvironment?.resumeId} /></div>
    <div id="context-panel-target" role="tabpanel" aria-labelledby="context-tab-target" className="min-h-0 flex-1 overflow-y-auto" hidden={activeTab !== 'target'}><InterviewTargetEditor library={library.library} bridge={bridge} onLibrary={library.acceptLibrary} preferredId={settings.interviewEnvironment?.targetId} /></div>
    <div id="context-panel-references" role="tabpanel" aria-labelledby="context-tab-references" className="min-h-0 flex-1 overflow-y-auto" hidden={activeTab !== 'references'}><ReferenceLibrary settings={settings} bridge={bridge} onSave={onSave} /></div>
  </section>
}
