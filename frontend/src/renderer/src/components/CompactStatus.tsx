import type { ReactNode } from 'react'
import { Microphone, Stop } from '@phosphor-icons/react'
import type { SessionController } from '../hooks/useSession'
import { formatDuration } from '../hooks/useInterviewTime'
import { Button, IconButton } from './ui/button'
import { cn } from '../lib/cn'

interface CompactStatusProps {
  recording?: ReactNode
  session: SessionController
  remaining: number
  ending: boolean
  onEnd: () => void
}
export default function CompactStatus({ session, remaining, ending, onEnd, recording: recordingControl }: CompactStatusProps) {
  const recording = ['listening', 'connecting', 'stopping'].includes(session.status)
  const label = session.status === 'listening' ? '转写中' : session.status === 'connecting' ? '连接中' : session.status === 'stopping' ? '停止中' : '待转写'
  return <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-2 text-sm text-text-secondary">
    <span className="flex items-center gap-2 font-medium text-accent-text"><span className={cn('size-2 rounded-full', recording ? 'bg-accent' : 'bg-text-secondary')} aria-hidden="true" />{label}</span>
    <IconButton className="size-7" aria-label={recording ? '停止转写' : '开始转写'} title={recording ? '停止转写' : '开始转写'} disabled={!session.desktop || session.status === 'stopping'} onClick={() => void (recording ? session.stop() : session.start())}>{recording ? <Stop /> : <Microphone />}</IconButton>
    {recordingControl}
    <span className="ml-auto whitespace-nowrap">剩余 <b className={cn('font-mono font-medium tabular-nums text-text-primary', remaining <= 60 && 'text-danger')}>{formatDuration(remaining)}</b></span>
    <Button variant="quiet" size="sm" className="border-border-strong text-sm" disabled={ending} aria-label="结束面试" onClick={onEnd}>结束</Button>
  </div>
}
