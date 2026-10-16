import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { normalizeSourceShortcut } from '../../../shared/source-shortcut'
import type { DesktopBridge } from '../../../shared/types'
import { TextField } from './ui/field'
import { errorMessage } from '../hooks/useSettings'

function shortcutLabel(value: string): string {
  return value.replace('CommandOrControl', /Mac/i.test(navigator.platform) ? 'Cmd' : 'Ctrl')
}

export default function SourceShortcutPreferences({ bridge }: { bridge?: DesktopBridge }) {
  const [saved, setSaved] = useState('')
  const [candidate, setCandidate] = useState<string | undefined>()
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const pending = useRef<string | undefined>(undefined)
  const inFlight = useRef(false)
  useEffect(() => {
    if (!bridge?.getSourceShortcut) return
    let active = true
    void bridge.getSourceShortcut().then(settings => {
      if (active) { setSaved(settings.accelerator); setError(settings.error ?? ''); setReady(true) }
    }).catch(reason => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [bridge])
  async function save(accelerator: string) {
    if (!bridge || inFlight.current || !ready) return
    inFlight.current = true
    setBusy(true); setError(''); setRecording(false)
    field.current?.blur()
    try {
      const result = await bridge.saveSourceShortcut({ accelerator })
      setSaved(result.accelerator); setError(result.error ?? '')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setCandidate(undefined); inFlight.current = false; setBusy(false) }
  }
  function handleShortcutKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.key === 'Tab') return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat || ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return
    if (event.key === 'Escape') { field.current?.blur(); return }
    const unmodified = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    if (unmodified && ['Backspace', 'Delete'].includes(event.key)) {
      pending.current = ''; setCandidate(''); setError(''); return
    }
    pending.current = undefined
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      setCandidate(undefined); setError('请按 Cmd/Ctrl 或 Alt 加字母、数字等组合键。'); return
    }
    const key = /^(Key[A-Z]|Digit[0-9])$/.test(event.code) ? event.code.replace(/^(Key|Digit)/, '') : event.key === ' ' ? 'Space' : event.key
    const parts = [event.metaKey || event.ctrlKey ? 'CommandOrControl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean)
    try {
      const value = normalizeSourceShortcut(parts.join('+'))
      pending.current = value; setCandidate(value); setError('')
    } catch (reason) { setCandidate(undefined); setError(errorMessage(reason)) }
  }
  function handleKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    // Register only after releasing the entire chord so recording cannot trigger the new binding.
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || pending.current === undefined) return
    const value = pending.current
    pending.current = undefined
    void save(value)
  }
  return <section aria-label="快捷键" className="mb-6 border-b border-border pb-6">
    <h3 className="mb-4 text-sm font-semibold">快捷键</h3>
    <TextField ref={field} id="source-shortcut" label="切换系统音频 / 麦克风" readOnly
      data-shortcut-recorder="true" value={shortcutLabel(recording ? candidate ?? '' : saved)}
      disabled={busy || !ready} onKeyDown={handleShortcutKey} onKeyUp={handleKeyUp}
      onFocus={() => { pending.current = undefined; setCandidate(undefined); setRecording(true) }}
      onBlur={() => { pending.current = undefined; setCandidate(undefined); setRecording(false) }}
      placeholder={recording ? '请按快捷键…' : '点击录制快捷键'} error={error || undefined}
      hint={busy ? '正在保存…' : recording ? '松开组合键自动保存 · Backspace/Delete 清除 · Esc 取消' : `${saved ? '已生效' : '未设置'} · 点击录制，自动保存；仅在本机生效。`} />
  </section>
}
