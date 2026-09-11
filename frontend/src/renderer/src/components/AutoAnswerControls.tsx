import { useState } from 'react'
import type { SessionController } from '../hooks/useSession'
import { errorMessage } from '../hooks/useSettings'
import { ToggleSwitch } from './ui/switch'
import { cn } from '../lib/cn'
import { inlineErrorClass } from '../lib/form'

interface AutoAnswerControlsProps { session: SessionController; compact?: boolean }
interface AutoAnswerPreference { enabled: boolean; pauseMs: number }
const stateLabels = {
  off: '自动回答已暂停',
  listening: '正在听，问题结束后自动回答',
  finalizing: '等待语音转写定稿',
  waiting: '问题已定稿，等待停顿',
  skipped: '这段未识别为提问，可手动生成回答',
  queued: '等当前回答完成',
  editing: '编辑中暂缓自动回答',
  manual: '已取消这次自动回答，可点击“回答这句”手动生成'
}

function statusMessage(session: SessionController, enabled: boolean): string {
  if (!enabled) return '已关闭，仍可手动生成回答'
  if (session.source !== 'system') return '仅系统音频生效，麦克风需手动回答'
  if (session.questionAssembling) return '正在合并问题，自动回答暂缓；提交或清空后恢复'
  if (!session.autoAnswerModelReady) return '请先在设置中连接回答模型'
  if (session.status === 'connecting') return '转写连接后开始自动回答'
  if (session.status !== 'listening') return '开启系统音频转写后自动回答'
  return stateLabels[session.autoAnswerState]
}

/* v30 ctx-note 式单行:开关 + 状态注(单行截断) + 等待停顿文本展示(修改入口在「模型与设置」) */
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
  const message = busy ? '正在保存自动回答设置…' : statusMessage(session, preference.enabled)
  return <section className={cn(compact ? 'm-0 shrink-0 bg-subtle px-4 py-3' : 'border-b border-border px-5 py-2')} aria-label="自动回答设置" aria-busy={busy}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <ToggleSwitch size="sm" label="自动回答" checked={preference.enabled} disabled={busy || !session.desktop}
          onCheckedChange={checked => void handleChange({ ...preference, enabled: checked })} />
        <p className="m-0 min-w-0 truncate text-[10.5px] text-text-muted" role="status" title={message}>{message}</p>
      </div>
      <span className="shrink-0 text-[10.5px] text-text-muted">等待停顿 {preference.pauseMs / 1000} 秒</span>
    </div>
    {error && <p className={inlineErrorClass} role="alert">{error}</p>}
  </section>
}
