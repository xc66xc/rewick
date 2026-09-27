import { Record } from '@phosphor-icons/react'
import type { useInterviewRecording } from '../hooks/useInterviewRecording'
import { formatDuration } from '../hooks/useInterviewTime'
import { Button } from './ui/button'

interface Props { recording: ReturnType<typeof useInterviewRecording> }
export default function InterviewRecordingControl({ recording }: Props) {
  if (!recording.supported) return null
  const busy = recording.state === 'starting' || recording.state === 'stopping'
  const label = recording.state === 'recording' ? '录音中' : recording.state === 'starting' ? '正在启动录音…'
    : recording.state === 'stopping' ? '正在保存录音…' : recording.error ? '录音未完成' : recording.state === 'saved' ? '录音已保存' : '准备录音'
  return <section aria-label="面试录音" className="flex flex-wrap items-center gap-2 text-xs">
    <span role="status" className={recording.error ? 'text-danger' : 'text-accent-text'} title={recording.error || '系统声音与麦克风 · 本机保存'}>
      <Record className="mr-1 inline" aria-hidden="true" />{label}
    </span>
    {recording.state === 'recording' && <span className="font-mono tabular-nums text-accent-text">{formatDuration(recording.seconds)}</span>}
    {recording.error && !busy && <Button size="xs" onClick={() => void recording.start()} title={recording.error}>重试录音</Button>}
  </section>
}
