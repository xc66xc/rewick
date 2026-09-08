import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Key, X } from '@phosphor-icons/react'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'
import { errorMessage, settingsInput } from '../hooks/useSettings'
import AsrSettingsFields from './AsrSettingsFields'
import ModelSettingsFields from './ModelSettingsFields'
import EmbeddingSettingsFields from './EmbeddingSettingsFields'
import RemoteKnowledgeSettingsFields from './RemoteKnowledgeSettingsFields'
import PlatformSettingsFields from './PlatformSettingsFields'
import IconButton from './IconButton'
import styles from '../styles/App.module.css'

interface SettingsDialogProps { settings: Settings; bridge: DesktopBridge | undefined; onSave: (input: SettingsInput) => Promise<Settings>; onClose: () => void }
export default function SettingsDialog({ settings, bridge, onSave, onClose }: SettingsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const feedback = useRef<HTMLParagraphElement>(null)
  const [draft, setDraft] = useState(() => settingsInput(settings))
  const [accountSettings, setAccountSettings] = useState(settings)
  const [platformFeedback, setPlatformFeedback] = useState<{ message: string; isError: boolean }>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    const previouslyFocused = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus() }
  }, []) // Native dialog owns focus trapping for its mounted lifetime.
  useEffect(() => {
    if (notice || error) feedback.current?.scrollIntoView({ block: 'nearest' })
  }, [notice, error])
  useEffect(() => { setAccountSettings(settings) }, [settings])
  async function handlePlatform(action: 'login' | 'logout' | 'refresh', credentials?: { username: string; password: string }) {
    if (!bridge) return
    setBusy(true); setError(''); setNotice(''); setPlatformFeedback(undefined)
    try {
      if (action !== 'logout') await onSave({ ...settingsInput(settings), platform: draft.platform })
      const value = action === 'login' && credentials ? await bridge.platformLogin(credentials)
        : action === 'logout' ? await bridge.platformLogout() : await bridge.refreshPlatform()
      setAccountSettings(value)
      setPlatformFeedback({ message: action === 'logout' ? '已退出平台账号' : '平台连接已更新', isError: false })
    } catch (reason) { setPlatformFeedback({ message: errorMessage(reason), isError: true }) }
    finally { setBusy(false) }
  }
  const platformActions = {
    login: (credentials: { username: string; password: string }) => handlePlatform('login', credentials),
    logout: () => handlePlatform('logout'), refresh: () => handlePlatform('refresh'),
  }
  async function handleSave(test: 'model' | 'embedding' | 'remoteKnowledge' | null) {
    if (!form.current?.reportValidity()) return
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await onSave({ ...settingsInput(settings), platform: draft.platform, answerStyle: draft.answerStyle,
        asr: { ...draft.asr, apiKey: draft.asr.apiKey === '' ? '' : draft.asr.apiKey?.trim() || undefined }, llm: { ...draft.llm, apiKey: draft.llm.apiKey === '' ? '' : draft.llm.apiKey?.trim() || undefined },
        embedding: { ...draft.embedding, apiKey: draft.embedding.apiKey?.trim() || undefined },
        remoteKnowledge: { ...draft.remoteKnowledge, url: draft.remoteKnowledge.url.trim(), agentId: draft.remoteKnowledge.agentId.trim(), apiKey: draft.remoteKnowledge.apiKey === '' ? '' : draft.remoteKnowledge.apiKey?.trim() || undefined } })
      setDraft(settingsInput(value))
      if (test && bridge) { const result = await (test === 'remoteKnowledge' ? bridge.testRemoteKnowledge() : test === 'embedding' ? bridge.testEmbedding() : bridge.testModel()); setNotice(`设置已保存 · ${result.message}（${result.latencyMs} ms）`) }
      else setNotice('设置已保存')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className={styles.settingsDialog} aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>按你的习惯连接</span><h2 id="settings-title">模型与设置</h2></div><IconButton label="关闭设置" onClick={onClose} disabled={busy}><X size={20} weight="bold" /></IconButton></header>
    <form ref={form} onSubmit={event => { event.preventDefault(); void handleSave(null) }}>
      <div className={styles.dialogBody}><fieldset className={styles.settingsFields} disabled={busy}>
        <PlatformSettingsFields draft={draft} saved={accountSettings} onChange={setDraft} actions={platformActions} disabled={busy || !bridge} feedback={platformFeedback} />
        <ModelSettingsFields draft={draft} saved={settings} onChange={setDraft} /><AsrSettingsFields draft={draft} saved={settings} onChange={setDraft} />
        <EmbeddingSettingsFields draft={draft} saved={settings} onChange={setDraft} onTest={() => void handleSave('embedding')} disabled={busy || !bridge} />
        <RemoteKnowledgeSettingsFields draft={draft} saved={settings} onChange={setDraft} onTest={() => void handleSave('remoteKnowledge')} disabled={busy || !bridge} />
        </fieldset>
        <p className={styles.keyNote}><Key size={16} weight="bold" />自带 Key 和平台登录凭证加密保存在这台设备。平台服务由后端中转；音频发送到转写服务，简历、JD 和相关资料发送到回答模型。建立本地资料索引时，资料片段发送到向量服务。</p>
        {notice && <p ref={feedback} className={styles.successNotice} role="status"><CheckCircle size={18} weight="fill" />{notice}</p>}
        {error && <p ref={feedback} className={styles.inlineError} role="alert">{error}</p>}
      </div>
      <footer className={styles.dialogFooter}><button type="button" className={styles.secondaryButton} disabled={busy || !bridge} onClick={() => void handleSave('model')}>{busy ? '处理中…' : '保存并测试模型'}</button>
        <button type="submit" className={styles.primaryButton} disabled={busy || !bridge}>保存设置</button></footer>
    </form>
  </dialog>
}
