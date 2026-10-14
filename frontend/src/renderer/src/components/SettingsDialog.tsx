import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import type { CustomServiceProfile, DesktopBridge, ServiceKind, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from '../hooks/useSettings'
import { selectionFor, serviceLabels } from '../hooks/serviceChoices'
import CustomServiceDialog from './CustomServiceDialog'
import RemoveServiceDialog from './RemoveServiceDialog'
import ServicePreferences from './ServicePreferences'
import WebSearchPreferences from './WebSearchPreferences'
import ServiceSelector from './ServiceSelector'
import { Button } from './ui/button'
import { Modal, ConfirmModal } from './ui/dialog'
import { toast } from './ui/toast'
import { formNoteClass, inlineErrorClass, successNoticeClass } from '../lib/form'

interface SettingsDialogProps {
  windowControls?: ReactNode
  settings: Settings; bridge: DesktopBridge | undefined; onSave: (input: SettingsInput) => Promise<Settings>
  onApply?: (settings: Settings) => void; onLogout?: () => Promise<void>; onClose: () => void
}
const kinds: ServiceKind[] = ['llm', 'asr', 'knowledge']
const groupClass = 'm-0 mb-6 min-w-0 border-0 border-b border-border p-0 pb-6'
function initialDraft(settings: Settings): SettingsInput {
  // Omit unselected kinds entirely instead of storing `kind: undefined`, which survives IPC and zod as an explicit undefined entry.
  const serviceSelections: SettingsInput['serviceSelections'] = {}
  for (const kind of kinds) { const selection = selectionFor(settings, kind); if (selection) serviceSelections[kind] = selection }
  return { ...settingsInput(settings), serviceSelections }
}
export default function SettingsDialog({ settings, bridge, onSave, onApply, onLogout, onClose, windowControls }: SettingsDialogProps) {
  const form = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  const returnFocus = useRef(document.activeElement)
  const [draft, setDraft] = useState(() => initialDraft(settings))
  const [catalog, setCatalog] = useState(settings)
  const advanced = catalog.platform?.advancedSettingsEnabled === true
  const [editor, setEditor] = useState<{ kind: ServiceKind; profile?: CustomServiceProfile }>()
  const [removing, setRemoving] = useState<CustomServiceProfile>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [reloadConfirm, setReloadConfirm] = useState(false)
  useEffect(() => {
    const previouslyFocused = returnFocus.current
    return () => { if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus() }
  }, [])
  useEffect(() => { setCatalog(settings) }, [settings])
  useEffect(() => { if (!advanced) { setEditor(undefined); setRemoving(undefined) } }, [advanced])
  async function perform(action: 'save' | 'refresh' | 'reload' | 'logout') {
    if (!bridge || inFlight.current || (action === 'save' && !form.current?.reportValidity())) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'logout') { if (onLogout) await onLogout(); else { const value = await bridge.platformLogout(); onApply?.(value); onClose() } }
      else if (action === 'reload') { const value = await bridge.getSettings(); setCatalog(value); setDraft(initialDraft(value)); onApply?.(value); setNotice('已读取服务器设置，本机自定义服务选择仍保留。') }
      else if (action === 'refresh') { const value = await bridge.refreshPlatform(); setCatalog(value); onApply?.(value); setNotice('平台服务列表已刷新，未保存的选择已保留。') }
      else {
        const value = await onSave({ ...settingsInput(settings), preferencesVersion: draft.preferencesVersion, serviceSelections: advanced ? draft.serviceSelections : catalog.serviceSelections,
          answerStyle: draft.answerStyle, llm: { ...settingsInput(settings).llm, temperature: advanced ? draft.llm.temperature : catalog.llm.temperature },
          asr: { ...settingsInput(settings).asr, silenceMs: draft.asr.silenceMs }, autoAnswer: draft.autoAnswer,
          retrieval: draft.retrieval, webSearch: { enabled: advanced && (draft.webSearch?.enabled ?? false) },
          remoteKnowledge: { ...settingsInput(settings).remoteKnowledge, enabled: advanced ? draft.remoteKnowledge.enabled : catalog.remoteKnowledge.enabled } })
        setCatalog(value); setDraft(initialDraft(value)); toast.show('设置已保存', { type: 'success' }); onClose()
      }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function applyCustom(value: Settings, kind: ServiceKind) {
    const selection = value.serviceSelections?.[kind]
    setCatalog(value); onApply?.(value)
    setDraft(current => {
      const serviceSelections = { ...current.serviceSelections }
      if (selection) serviceSelections[kind] = selection; else delete serviceSelections[kind]
      return { ...current, serviceSelections }
    })
    setEditor(undefined); setRemoving(undefined); setNotice('自定义服务已更新')
  }
  function requestClose() { if (!inFlight.current) onClose() }
  return <>
    <Modal open onOpenChange={nextOpen => { if (!nextOpen) requestClose() }} width="lg"
      title="模型与设置"
      footer={<>
        <Button disabled={busy} onClick={requestClose}>关闭</Button>
        <Button variant="primary" disabled={busy || !bridge} onClick={() => void perform('save')}>{busy ? '处理中…' : '保存设置'}</Button>
      </>}>
      {windowControls && <section aria-label="窗口与隐私" className={groupClass}><h3 className="mb-4 text-sm font-semibold">窗口与隐私</h3>{windowControls}</section>}
      <form ref={form} onSubmit={event => { event.preventDefault(); void perform('save') }}>
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy || !bridge}>
          <section aria-label="当前账号" className={groupClass}><h3 className="mb-2 text-sm font-semibold">当前账号</h3><p className={formNoteClass}>{catalog.platform?.user?.displayName || '尚未登录'}</p>
            <div className="mb-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => void perform('refresh')}>刷新平台服务</Button><Button size="sm" onClick={() => setReloadConfirm(true)}>重新读取云端设置</Button><Button size="sm" variant="quiet" className="text-danger hover:bg-danger-subtle" onClick={() => void perform('logout')}>退出登录</Button></div></section>
          {kinds.filter(kind => advanced || kind !== 'knowledge').map(kind => <fieldset className={groupClass} key={kind}><legend className="mb-4 w-full p-0 text-sm font-semibold">{serviceLabels[kind]}</legend>
            {advanced && <ServiceSelector kind={kind} settings={catalog} selection={draft.serviceSelections?.[kind]}
              onChange={selection => setDraft(current => ({ ...current, serviceSelections: { ...current.serviceSelections, [kind]: selection } }))}
              onCustom={profile => setEditor({ kind, profile })} onRemove={setRemoving} />}
            <ServicePreferences advanced={advanced} kind={kind} draft={draft} onChange={setDraft} />
          </fieldset>)}
          {advanced && <section aria-label="联网搜索" className={groupClass}><h3 className="mb-4 text-sm font-semibold">联网搜索</h3><WebSearchPreferences catalog={catalog} draft={draft} onChange={setDraft} /></section>}
        </fieldset>
        {notice && <p className={successNoticeClass} role="status"><CheckCircle size={18} aria-hidden="true" />{notice}</p>}{error && <p className={inlineErrorClass} role="alert">{error}</p>}
      </form>
    </Modal>
    <ConfirmModal open={reloadConfirm} onOpenChange={setReloadConfirm} title="重新读取云端设置" description="将替换本窗口尚未保存的设置草稿。已保存的本机自定义服务及 Key 不受影响。" confirmText="重新读取" onConfirm={() => { setReloadConfirm(false); void perform('reload') }} />
    {advanced && editor && bridge && <CustomServiceDialog kind={editor.kind} profile={editor.profile} settings={catalog} bridge={bridge} onSaved={value => applyCustom(value, editor.kind)} onClose={() => setEditor(undefined)} />}
    {advanced && removing && bridge && <RemoveServiceDialog profile={removing} bridge={bridge} onRemoved={value => applyCustom(value, removing.kind)} onClose={() => setRemoving(undefined)} />}
  </>
}
