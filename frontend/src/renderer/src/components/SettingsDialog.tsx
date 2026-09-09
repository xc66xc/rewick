import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Key, X } from '@phosphor-icons/react'
import type { CustomServiceProfile, DesktopBridge, ServiceKind, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from '../hooks/useSettings'
import { selectionFor, serviceLabels } from '../hooks/serviceChoices'
import CustomServiceDialog from './CustomServiceDialog'
import RemoveServiceDialog from './RemoveServiceDialog'
import ServicePreferences from './ServicePreferences'
import ServiceSelector from './ServiceSelector'
import IconButton from './IconButton'
import styles from '../styles/App.module.css'

interface SettingsDialogProps {
  settings: Settings; bridge: DesktopBridge | undefined; onSave: (input: SettingsInput) => Promise<Settings>
  onApply?: (settings: Settings) => void; onLogout?: () => Promise<void>; onClose: () => void
}
const kinds: ServiceKind[] = ['llm', 'asr', 'embedding', 'knowledge']
function initialDraft(settings: Settings): SettingsInput {
  return { ...settingsInput(settings), serviceSelections: Object.fromEntries(kinds.map(kind => [kind, selectionFor(settings, kind)])) }
}
export default function SettingsDialog({ settings, bridge, onSave, onApply, onLogout, onClose }: SettingsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  const [draft, setDraft] = useState(() => initialDraft(settings))
  const [catalog, setCatalog] = useState(settings)
  const [editor, setEditor] = useState<{ kind: ServiceKind; profile?: CustomServiceProfile }>()
  const [removing, setRemoving] = useState<CustomServiceProfile>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
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
        setCatalog(value); setDraft(initialDraft(value)); setNotice('设置已保存')
      }
    } catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function applyCustom(value: Settings, kind: ServiceKind) {
    setCatalog(value); onApply?.(value)
    setDraft(current => ({ ...current, serviceSelections: { ...current.serviceSelections, [kind]: value.serviceSelections?.[kind] } }))
    setEditor(undefined); setRemoving(undefined); setNotice('自定义服务已更新')
  }
  return <>
    <dialog ref={dialog} className={styles.settingsDialog} aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose() }}>
      <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>按你的习惯连接</span><h2 id="settings-title">模型与设置</h2></div><IconButton label="关闭设置" onClick={onClose} disabled={busy}><X size={20} weight="bold" /></IconButton></header>
      <form ref={form} onSubmit={event => { event.preventDefault(); void perform('save') }}>
        <div className={styles.dialogBody}><fieldset className={styles.settingsFields} disabled={busy || !bridge}>
          <section className={styles.settingsGroup} aria-label="当前账号"><h3 className={styles.accountHeading}>当前账号</h3><p className={styles.formNote}>{catalog.platform?.user?.email || catalog.platform?.user?.username || '尚未登录'}</p>
            <div className={styles.platformActions}><button className={styles.secondaryButton} type="button" onClick={() => void perform('refresh')}>刷新平台服务</button><button className={styles.textButton} type="button" onClick={() => void perform('logout')}>退出登录</button></div></section>
          {kinds.map(kind => <fieldset className={styles.settingsGroup} key={kind}><legend>{serviceLabels[kind]}</legend>
            <ServiceSelector kind={kind} settings={catalog} selection={draft.serviceSelections?.[kind]}
              onChange={selection => setDraft(current => ({ ...current, serviceSelections: { ...current.serviceSelections, [kind]: selection } }))}
              onCustom={profile => setEditor({ kind, profile })} onRemove={setRemoving} />
            <ServicePreferences kind={kind} draft={draft} onChange={setDraft} />
          </fieldset>)}
        </fieldset>
          <p className={styles.keyNote}><Key size={16} weight="bold" />自定义 Key 和登录凭证加密保存在本机。平台服务由后端中转；音频、问题和参考内容发送到所选服务。</p>
          {notice && <p className={styles.successNotice} role="status"><CheckCircle size={18} weight="fill" />{notice}</p>}{error && <p className={styles.inlineError} role="alert">{error}</p>}
        </div>
        <footer className={styles.dialogFooter}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>关闭</button><button type="submit" className={styles.primaryButton} disabled={busy || !bridge}>{busy ? '处理中…' : '保存设置'}</button></footer>
      </form>
    </dialog>
    {editor && bridge && <CustomServiceDialog kind={editor.kind} profile={editor.profile} settings={catalog} bridge={bridge} onSaved={value => applyCustom(value, editor.kind)} onClose={() => setEditor(undefined)} />}
    {removing && bridge && <RemoveServiceDialog profile={removing} bridge={bridge} onRemoved={value => applyCustom(value, removing.kind)} onClose={() => setRemoving(undefined)} />}
  </>
}
