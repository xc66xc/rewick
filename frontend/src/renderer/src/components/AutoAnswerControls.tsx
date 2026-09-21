import { useState } from 'react'
import type { SessionController } from '../hooks/useSession'
import { errorMessage } from '../hooks/useSettings'
import { ToggleSwitch } from './ui/switch'
import { cn } from '../lib/cn'
import { inlineErrorClass } from '../lib/form'

interface AutoAnswerControlsProps { session: SessionController; compact?: boolean }
interface AutoAnswerPreference { enabled: boolean; pauseMs: number }
export default function AutoAnswerControls({ session, compact = false }: AutoAnswerControlsProps) {
  const [pending, setPending] = useState<AutoAnswerPreference | null>(null)
  const [error, setError] = useState('')
  const preference = pending ?? session.autoAnswer
  const busy = pending !== null || session.autoAnswerSaving
  async function handleChange(next: AutoAnswerPreference) {
    if (busy) return
    setError(''); setPending(next)
    try { await session.setAutoAnswer(next) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setPending(null) }
  }
  return <section className={cn(compact ? 'm-0 shrink-0 bg-subtle px-4 py-3' : 'border-b border-border px-5 py-2')} aria-label="自动回答设置" aria-busy={busy}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <ToggleSwitch size="sm" label="自动回答" checked={preference.enabled} disabled={busy || !session.desktop}
          onCheckedChange={checked => void handleChange({ ...preference, enabled: checked })} />
      </div>
      <span className="shrink-0 text-[10.5px] text-text-muted">等待停顿 {preference.pauseMs / 1000} 秒</span>
    </div>
    {error && <p className={inlineErrorClass} role="alert">{error}</p>}
  </section>
}
