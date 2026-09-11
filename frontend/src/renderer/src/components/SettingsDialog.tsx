import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Key } from '@phosphor-icons/react'
import type { CustomServiceProfile, DesktopBridge, ServiceKind, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from '../hooks/useSettings'
import { selectionFor, serviceLabels } from '../hooks/serviceChoices'
import CustomServiceDialog from './CustomServiceDialog'
import RemoveServiceDialog from './RemoveServiceDialog'
import ServicePreferences from './ServicePreferences'
import ServiceSelector from './ServiceSelector'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'
import { toast } from './ui/toast'
import { formNoteClass, inlineErrorClass, successNoticeClass } from '../lib/form'

interface SettingsDialogProps {
  settings: Settings; bridge: DesktopBridge | undefined; onSave: (input: SettingsInput) => Promise<Settings>
  onApply?: (settings: Settings) => void; onLogout?: () => Promise<void>; onClose: () => void
}
const kinds: ServiceKind[] = ['llm', 'asr', 'knowledge']
const groupClass = 'm-0 mb-6 min-w-0 border-0 border-b border-border p-0 pb-6'
function initialDraft(settings: Settings): SettingsInput {
  return { ...settingsInput(settings), serviceSelections: Object.fromEntries(kinds.map(kind => [kind, selectionFor(settings, kind)])) }
}
export default function SettingsDialog({ settings, bridge, onSave, onApply, onLogout, onClose }: SettingsDialogProps) {
  const form = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  const returnFocus = useRef(document.activeElement)
  const [draft, setDraft] = useState(() => initialDraft(settings))
  const [catalog, setCatalog] = useState(settings)
  const [editor, setEditor] = useState<{ kind: ServiceKind; profile?: CustomServiceProfile }>()
  const [removing, setRemoving] = useState<CustomServiceProfile>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const previouslyFocused = returnFocus.current
    return () => { if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus() }
  }, [])
  useEffect(() => { setCatalog(settings) }, [settings])
  async function perform(action: 'save' | 'refresh' | 'logout') {
    if (!bridge || inFlight.current || (action === 'save' && !form.current?.reportValidity())) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'logout') { if (onLogout) await onLogout(); else { const value = await bridge.platformLogout(); onApply?.(value); onClose() } }
      else if (action === 'refresh') { const value = await bridge.refreshPlatform(); setCatalog(value); onApply?.(value); setNotice('平台服务列表已刷新，未保存的选择已保留。') }
      else {
        const value = await onSave({ ...settingsInput(settings), serviceSelections: draft.serviceSelections,
          answerStyle: draft.answerStyle, llm: { ...settingsInput(settings).llm, temperature: draft.llm.temperature },
          asr: { ...settingsInput(settings).asr, silenceMs: draft.asr.silenceMs }, autoAnswer: draft.autoAnswer,
          retrieval: draft.retrieval, remoteKnowledge: { ...settingsInput(settings).remoteKnowledge, enabled: draft.remoteKnowledge.enabled } })
        setCatalog(value); setDraft(initialDraft(value)); toast.show('设置已保存', { type: 'success' }); onClose()
      }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function applyCustom(value: Settings, kind: ServiceKind) {
    setCatalog(value); onApply?.(value)
    setDraft(current => ({ ...current, serviceSelections: { ...current.serviceSelections, [kind]: value.serviceSelections?.[kind] } }))
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
      <form ref={form} onSubmit={event => { event.preventDefault(); void perform('save') }}>
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy || !bridge}>
          <section aria-label="当前账号" className={groupClass}><h3 className="mb-2 text-sm font-semibold">当前账号</h3><p className={formNoteClass}>{catalog.platform?.user?.displayName || '尚未登录'}</p>
            <div className="mb-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => void perform('refresh')}>刷新平台服务</Button><Button size="sm" variant="quiet" onClick={() => void perform('logout')}>退出登录</Button></div></section>
          {kinds.map(kind => <fieldset className={groupClass} key={kind}><legend className="mb-4 w-full p-0 text-sm font-semibold">{serviceLabels[kind]}</legend>
            <ServiceSelector kind={kind} settings={catalog} selection={draft.serviceSelections?.[kind]}
              onChange={selection => setDraft(current => ({ ...current, serviceSelections: { ...current.serviceSelections, [kind]: selection } }))}
              onCustom={profile => setEditor({ kind, profile })} onRemove={setRemoving} />
            <ServicePreferences kind={kind} draft={draft} onChange={setDraft} />
          </fieldset>)}
        </fieldset>
        <p className="flex items-start gap-2 text-xs leading-[1.8] text-text-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"><Key aria-hidden="true" />自定义 Key 和登录凭证加密保存在本机。平台服务由后端中转；音频、问题和参考内容发送到所选服务。</p>
        {notice && <p className={successNoticeClass} role="status"><CheckCircle size={18} aria-hidden="true" />{notice}</p>}{error && <p className={inlineErrorClass} role="alert">{error}</p>}
      </form>
    </Modal>
    {editor && bridge && <CustomServiceDialog kind={editor.kind} profile={editor.profile} settings={catalog} bridge={bridge} onSaved={value => applyCustom(value, editor.kind)} onClose={() => setEditor(undefined)} />}
    {removing && bridge && <RemoveServiceDialog profile={removing} bridge={bridge} onRemoved={value => applyCustom(value, removing.kind)} onClose={() => setRemoving(undefined)} />}
  </>
}
