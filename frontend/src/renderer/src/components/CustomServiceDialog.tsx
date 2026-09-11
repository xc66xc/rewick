import { useEffect, useRef, useState } from 'react'
import type { CustomServiceInput, CustomServiceProfile, DesktopBridge, ServiceKind, Settings } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import { serviceLabels } from '../hooks/serviceChoices'
import CustomServiceFields from './CustomServiceFields'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'
import { formNoteClass, inlineErrorClass, successNoticeClass } from '../lib/form'

interface CustomServiceDialogProps { kind: ServiceKind; profile?: CustomServiceProfile; settings: Settings; bridge: DesktopBridge; onSaved: (value: Settings) => void; onClose: () => void }
const eyebrowClass = 'mb-2 block text-xs font-medium leading-[1.5] tracking-[0.09em] text-text-secondary'
function initial(kind: ServiceKind, settings: Settings, profile?: CustomServiceProfile): CustomServiceInput {
  if (profile) { const { hasApiKey: _hasApiKey, ...input } = profile; return input }
  if (kind === 'llm') return { kind, name: '', url: settings.llm.baseUrl, model: settings.llm.model }
  if (kind === 'asr') return { kind, name: '', url: settings.asr.url, model: settings.asr.model }
  return { kind, name: '', url: settings.remoteKnowledge.url, agentId: settings.remoteKnowledge.agentId }
}
export default function CustomServiceDialog({ kind, profile, settings, bridge, onSaved, onClose }: CustomServiceDialogProps) {
  const form = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  const returnFocus = useRef(document.activeElement)
  const [draft, setDraft] = useState(() => initial(kind, settings, profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const previouslyFocused = returnFocus.current
    return () => { if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus() }
  }, [])
  async function submit(test: boolean) {
    if (inFlight.current || !form.current?.reportValidity()) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const input = { ...draft, name: draft.name.trim(), url: draft.url.trim(), model: draft.model?.trim(), agentId: draft.agentId?.trim(), apiKey: draft.apiKey?.trim() || undefined }
      if (test) { const result = await bridge.testCustomService(input); setNotice(`${result.message}（${result.latencyMs} ms）。测试未保存配置。`) }
      else { const saved = await bridge.saveCustomService(input); setDraft(value => ({ ...value, apiKey: undefined })); onSaved(saved) }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function requestClose() { if (!inFlight.current) onClose() }
  return <Modal open onOpenChange={nextOpen => { if (!nextOpen) requestClose() }}
    title={<><span aria-hidden="true" className={eyebrowClass}>我的自定义</span>{profile ? '编辑' : '添加'}{serviceLabels[kind]}</>}
    footer={<>
      <Button variant="quiet" disabled={busy} onClick={requestClose}>取消</Button>
      <Button disabled={busy} onClick={() => void submit(true)}>测试连接</Button>
      <Button variant="primary" disabled={busy} onClick={() => void submit(false)}>{busy ? '处理中…' : '保存并选用'}</Button>
    </>}>
    <form ref={form} onSubmit={event => { event.preventDefault(); void submit(false) }}>
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy}><CustomServiceFields draft={draft} saved={profile} onChange={setDraft} /></fieldset>
      <p className={formNoteClass}>测试只使用当前草稿。保存后选用此服务，API Key 加密保存在本机。</p>
      {notice && <p className={successNoticeClass} role="status">{notice}</p>}{error && <p className={inlineErrorClass} role="alert">{error}</p>}
    </form>
  </Modal>
}
