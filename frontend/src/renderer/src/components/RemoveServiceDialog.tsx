import { useEffect, useRef, useState } from 'react'
import type { CustomServiceProfile, DesktopBridge, Settings } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import styles from '../styles/App.module.css'

interface RemoveServiceDialogProps { profile: CustomServiceProfile; bridge: DesktopBridge; onRemoved: (settings: Settings) => void; onClose: () => void }
export default function RemoveServiceDialog({ profile, bridge, onRemoved, onClose }: RemoveServiceDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  async function remove() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { onRemoved(await bridge.removeCustomService(profile.id)) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className={styles.settingsDialog} aria-labelledby="remove-service-title" aria-describedby="remove-service-description" onCancel={event => { event.preventDefault(); if (!inFlight.current) onClose() }}>
    <header className={styles.dialogHeader}><h2 id="remove-service-title">删除自定义服务</h2></header>
    <div className={styles.dialogBody}><p id="remove-service-description">将删除「{profile.name}」及其保存在本机的 API Key，无法撤销。正在使用此配置时，需要重新选择服务；不会自动切换到平台。</p>{error && <p role="alert" className={styles.inlineError}>{error}</p>}</div>
    <footer className={styles.dialogFooter}><button type="button" autoFocus disabled={busy} className={styles.secondaryButton} onClick={onClose}>取消</button><button type="button" disabled={busy} className={styles.primaryButton} onClick={() => void remove()}>{busy ? '删除中…' : '确认删除'}</button></footer>
  </dialog>
}
