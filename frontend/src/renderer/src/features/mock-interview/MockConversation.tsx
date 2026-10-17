import { Button } from '../../components/ui/button'
import { TextareaField } from '../../components/ui/field'
import type { useMockInterview } from './useMockInterview'
interface Props { interview: ReturnType<typeof useMockInterview>; onCommand: (command: Parameters<ReturnType<typeof useMockInterview>['command']>[0]) => void }
export default function MockConversation({ interview, onCommand }: Props) {
  const { session, busy, connected } = interview
  if (!session) return null
  return <section className="flex min-h-0 flex-col gap-4 rounded-card border border-border bg-card p-5">
    <h2 className="text-lg font-semibold">面试对话</h2>
    <div className="max-h-[400px] space-y-4 overflow-y-auto" aria-label="面试问答记录">
      {session.turns.map(turn => <article key={turn.id} className="space-y-2 border-b border-border pb-4"><h3 className="text-sm font-semibold">第 {turn.number} 题 · {turn.question}</h3>{turn.answerText && <p className="whitespace-pre-wrap text-sm leading-7 text-text-secondary">{turn.answerText}</p>}{turn.status === 'skipped' && <p className="text-xs text-text-muted">已跳过</p>}</article>)}
    </div>
    {session.state === 'listening' && <><TextareaField label="你的回答（可修改字幕，离开输入框后继续自动提交）" value={interview.draft + interview.partial} onChange={event => interview.edit(event.target.value)} onFocus={() => interview.editing(true)} onBlur={() => interview.editing(false)} rows={5} /><p className="text-sm text-text-secondary" aria-live="polite">{interview.micReady ? interview.hint || `正在倾听，停顿 ${(session.pauseMs ?? 1800) / 1000} 秒后自动提交。` : '正在建立语音识别连接…'}</p></>}
    <div className="flex flex-wrap gap-2">
      {session.state === 'ready' && <Button variant="primary" disabled={busy || !connected} onClick={() => onCommand('start')}>开始面试</Button>}
      {session.state === 'listening' && <Button variant="primary" disabled={busy || !(interview.draft + interview.partial).trim()} onClick={() => onCommand('submit_answer')}>我回答完了</Button>}
      {session.state === 'speaking' && <Button onClick={() => onCommand('interrupt')}>打断并回答</Button>}
      {['listening', 'paused'].includes(session.state) && <Button disabled={busy || !connected} onClick={() => onCommand('repeat')}>重复问题</Button>}
      {['listening', 'speaking'].includes(session.state) && <Button disabled={busy || !connected} onClick={() => onCommand('skip')}>跳过问题</Button>}
      {['starting', 'speaking', 'listening', 'deciding'].includes(session.state) && <Button onClick={() => onCommand('pause')}>暂停</Button>}
      {session.state === 'paused' && <Button variant="primary" disabled={busy || !connected} onClick={() => onCommand('resume')}>恢复面试</Button>}
      {!['completed', 'ready'].includes(session.state) && <Button variant="outline" className="text-danger" onClick={() => onCommand('finish')}>结束面试</Button>}
    </div>
  </section>
}
