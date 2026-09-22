import { Record, Stop } from '@phosphor-icons/react'
import type { useInterviewRecording } from '../hooks/useInterviewRecording'
import { formatDuration } from '../hooks/useInterviewTime'
import { Button } from './ui/button'

interface Props { recording: ReturnType<typeof useInterviewRecording> }
export default function InterviewRecordingControl({ recording }: Props) {
  if (!recording.supported) return null
  const recordingNow = recording.state === 'recording'
  const busy = recording.state === 'starting' || recording.state === 'stopping'
  return <section aria-label="面试录音" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
    <Button size="xs" disabled={busy || recording.state === 'saved'} onClick={() => void (recordingNow ? recording.stop() : recording.start())}>
      {recordingNow ? <Stop aria-hidden="true" /> : <Record aria-hidden="true" />}
      {recordingNow ? '停止录音' : busy ? '正在处理…' : recording.state === 'saved' ? '录音已保存' : '开始录音'}
    </Button>
    <span role="status" className="text-text-secondary">{recordingNow ? `录音中 ${formatDuration(recording.seconds)}` : recording.state === 'saved' ? '录音已保存在本机' : '系统声音与麦克风 · 本机保存'}</span>
    {recording.error && <span role="alert" className="basis-full text-danger">{recording.error}</span>}
  </section>
}
