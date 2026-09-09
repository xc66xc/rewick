import { useEffect, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { CustomServiceInput, CustomServiceProfile, DesktopBridge, ServiceKind, Settings } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import { serviceLabels } from '../hooks/serviceChoices'
import CustomServiceFields from './CustomServiceFields'
import IconButton from './IconButton'
import styles from '../styles/App.module.css'

interface CustomServiceDialogProps { kind: ServiceKind; profile?: CustomServiceProfile; settings: Settings; bridge: DesktopBridge; onSaved: (value: Settings) => void; onClose: () => void }
function initial(kind: ServiceKind, settings: Settings, profile?: CustomServiceProfile): CustomServiceInput {
  if (profile) { const { hasApiKey: _hasApiKey, ...input } = profile; return input }
  if (kind === 'llm') return { kind, name: '', url: settings.llm.baseUrl, model: settings.llm.model }
  if (kind === 'asr') return { kind, name: '', url: settings.asr.url, model: settings.asr.model }
  if (kind === 'embedding') return { kind, name: '', url: settings.embedding.baseUrl, model: settings.embedding.model, dimensions: settings.embedding.dimensions }
  return { kind, name: '', url: settings.remoteKnowledge.url, agentId: settings.remoteKnowledge.agentId }
}
export default function CustomServiceDialog({ kind, profile, settings, bridge, onSaved, onClose }: CustomServiceDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  const [draft, setDraft] = useState(() => initial(kind, settings, profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
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
  return <dialog ref={dialog} className={styles.settingsDialog} aria-labelledby="custom-service-title" aria-busy={busy} onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose() }}>
    <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>我的自定义</span><h2 id="custom-service-title">{profile ? '编辑' : '添加'}{serviceLabels[kind]}</h2></div><IconButton label="关闭自定义服务" disabled={busy} onClick={onClose}><X size={20} /></IconButton></header>
    <form ref={form} onSubmit={event => { event.preventDefault(); void submit(false) }}>
      <div className={styles.dialogBody}><fieldset className={styles.settingsFields} disabled={busy}><CustomServiceFields draft={draft} saved={profile} onChange={setDraft} /></fieldset>
        <p className={styles.formNote}>测试只使用当前草稿。保存后选用此服务，API Key 加密保存在本机。</p>
        {notice && <p className={styles.successNotice} role="status">{notice}</p>}{error && <p className={styles.inlineError} role="alert">{error}</p>}
      </div>
      <footer className={styles.dialogFooter}><button type="button" className={styles.textButton} disabled={busy} onClick={onClose}>取消</button><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void submit(true)}>测试连接</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? '处理中…' : '保存并选用'}</button></footer>
    </form>
  </dialog>
}
