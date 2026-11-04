import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { normalizeSourceShortcut } from '../../../shared/source-shortcut'
import type { DesktopBridge } from '../../../shared/types'
import { TextField } from './ui/field'
import { AppSelect } from './ui/select'
import { screenshotLanguages, type ScreenshotLanguage } from '../../../shared/screenshot-shortcut'
import { errorMessage } from '../hooks/useSettings'

function shortcutLabel(value: string): string {
  return value.replace('CommandOrControl', /Mac/i.test(navigator.platform) ? 'Cmd' : 'Ctrl')
}

const languageOptions = screenshotLanguages.map(value => ({ value, label: value }))
interface ShortcutFieldProps { bridge?: DesktopBridge; screenshot?: boolean }
function ShortcutField({ bridge, screenshot = false }: ShortcutFieldProps) {
  const [language, setLanguage] = useState<ScreenshotLanguage>('Java')
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
    const load = screenshot ? bridge?.getScreenshotShortcut : bridge?.getSourceShortcut
    if (!load) return
    let active = true
    void load().then(settings => {
      if (active && 'language' in settings) setLanguage(settings.language as ScreenshotLanguage)
      if (active) { setSaved(settings.accelerator); setError(settings.error ?? ''); setReady(true) }
    }).catch(reason => { if (active) setError(errorMessage(reason)) })
    return () => { active = false }
  }, [bridge, screenshot])
  async function save(accelerator: string, nextLanguage = language) {
    if (!bridge || inFlight.current || !ready) return
    inFlight.current = true
    setBusy(true); setError(''); setRecording(false)
    field.current?.blur()
    try {
      const result = screenshot ? await bridge.saveScreenshotShortcut?.({ accelerator, language: nextLanguage }) : await bridge.saveSourceShortcut({ accelerator })
      if (!result) throw new Error('当前版本不支持截图快捷键，请更新客户端。')
      setLanguage(nextLanguage)
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
  return <div className="mb-4">
    <TextField ref={field} id={screenshot ? 'screenshot-shortcut' : 'source-shortcut'} label={screenshot ? '全屏截图解题' : '切换系统音频 / 麦克风'} readOnly
      data-shortcut-recorder="true" value={shortcutLabel(recording ? candidate ?? '' : saved)}
      disabled={busy || !ready} onKeyDown={handleShortcutKey} onKeyUp={handleKeyUp}
      onFocus={() => { pending.current = undefined; setCandidate(undefined); setRecording(true) }}
      onBlur={() => { pending.current = undefined; setCandidate(undefined); setRecording(false) }}
      placeholder={recording ? '请按快捷键…' : '点击录制快捷键'} error={error || undefined}
      hint={busy ? '正在保存…' : recording ? '松开组合键自动保存 · Backspace/Delete 清除 · Esc 取消' : `${saved ? '已生效' : '未设置'} · 点击录制，自动保存；仅在本机生效。`} />
    {screenshot && <label className="mt-3 block text-xs font-medium text-text-secondary" htmlFor="screenshot-language">解题语言<AppSelect id="screenshot-language" value={language} options={languageOptions} disabled={busy || !ready || recording} onValueChange={value => { if (screenshotLanguages.includes(value as ScreenshotLanguage)) void save(saved, value as ScreenshotLanguage) }} /></label>}
    {screenshot && <p className="mt-2 text-xs text-text-muted">截取鼠标所在屏幕，直接生成思路与代码。识别模型由平台管理员配置；原图不保存到问答记录。</p>}
  </div>
}

export default function SourceShortcutPreferences({ bridge }: { bridge?: DesktopBridge }) {
  return <section aria-label="快捷键" className="mb-6 border-b border-border pb-6">
    <h3 className="mb-4 text-sm font-semibold">快捷键</h3>
    <ShortcutField bridge={bridge} />
    {bridge?.getScreenshotShortcut && bridge.saveScreenshotShortcut && <ShortcutField bridge={bridge} screenshot />}
  </section>
}
