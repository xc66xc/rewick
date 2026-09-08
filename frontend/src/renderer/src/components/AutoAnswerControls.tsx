import { useState } from 'react'
import type { SessionController } from '../hooks/useSession'
import { errorMessage } from '../hooks/useSettings'
import styles from '../styles/App.module.css'

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
  return <section className={`${styles.autoAnswerControls} ${compact ? styles.autoAnswerControlsCompact : ''}`} aria-label="自动回答设置" aria-busy={busy}>
    <div className={styles.autoAnswerRow}>
      <label className={styles.autoAnswerToggle}>
        <input type="checkbox" role="switch" aria-label="自动回答" checked={preference.enabled} disabled={busy || !session.desktop}
          onChange={event => void handleChange({ ...preference, enabled: event.target.checked })} />
        <span className={styles.autoAnswerSwitch} aria-hidden="true" /><span>自动回答</span>
      </label>
      <label className={styles.autoAnswerDelay}>等待停顿
        <select value={preference.pauseMs} disabled={busy || !session.desktop}
          onChange={event => void handleChange({ ...preference, pauseMs: Number(event.target.value) })}>
          <option value={1000}>1 秒</option><option value={1500}>1.5 秒</option><option value={2500}>2.5 秒</option>
        </select>
      </label>
    </div>
    <p className={styles.autoAnswerStatus} role="status">{busy ? '正在保存自动回答设置…' : statusMessage(session, preference.enabled)}</p>
    {error && <p className={styles.inlineError} role="alert">{error}</p>}
  </section>
}
