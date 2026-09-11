import { useEffect, useRef, useState } from 'react'
import type { CustomServiceProfile, DesktopBridge, Settings } from '../../../shared/types'
import { errorMessage } from '../hooks/useSettings'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'
import { inlineErrorClass } from '../lib/form'

interface RemoveServiceDialogProps { profile: CustomServiceProfile; bridge: DesktopBridge; onRemoved: (settings: Settings) => void; onClose: () => void }
export default function RemoveServiceDialog({ profile, bridge, onRemoved, onClose }: RemoveServiceDialogProps) {
  const inFlight = useRef(false)
  const returnFocus = useRef(document.activeElement)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const previouslyFocused = returnFocus.current
    return () => { if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus() }
  }, [])
  async function remove() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { onRemoved(await bridge.removeCustomService(profile.id)) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  function requestClose() { if (!inFlight.current) onClose() }
  return <Modal open onOpenChange={nextOpen => { if (!nextOpen) requestClose() }} title="删除自定义服务"
    footer={<>
      <Button autoFocus disabled={busy} onClick={requestClose}>取消</Button>
      <Button variant="primary" className="border-danger bg-danger hover:bg-danger/90 active:bg-danger" disabled={busy} onClick={() => void remove()}>{busy ? '删除中…' : '确认删除'}</Button>
    </>}>
    <p className="text-[13px] leading-[1.9] text-text-secondary">将删除「{profile.name}」及其保存在本机的 API Key，无法撤销。正在使用此配置时，需要重新选择服务；不会自动切换到平台。</p>
    {error && <p role="alert" className={inlineErrorClass}>{error}</p>}
  </Modal>
}
