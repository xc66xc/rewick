import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge } from '../../../shared/types'
import type { RecordingInfo, RecordingProgress } from '../../../shared/recording-types'
import { formatDuration } from '../hooks/useInterviewTime'
import { errorMessage } from '../hooks/useSettings'
import { Button } from './ui/button'

interface Props { bridge: DesktopBridge; sessionId: string }
const labels = { transcribing: '正在本机识别录音', summarizing: '正在生成复盘', exporting: '正在导出' }
export default function LocalRecording({ bridge, sessionId }: Props) {
  const [info, setInfo] = useState<RecordingInfo | null>(null)
  const [progress, setProgress] = useState<RecordingProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const exporting = useRef(false)
  useEffect(() => {
    let current = true
    setInfo(null); setNotice('')
    void bridge.recordings?.info(sessionId).then(value => { if (current) setInfo(value) }).catch(reason => { if (current) setNotice(errorMessage(reason)) })
    const off = bridge.onEvent(event => { if (current && event.kind === 'recording-progress' && event.sessionId === sessionId) setProgress(event) })
    return () => { current = false; off(); if (exporting.current) void bridge.recordings?.cancelExport?.(sessionId).catch(() => undefined) }
  }, [bridge, sessionId])
  async function exportReview() {
    exporting.current = true
    setBusy(true); setNotice(''); setProgress(null)
    try {
      const result = await bridge.recordings?.exportReview(sessionId)
      if (result) setNotice(`复盘已导出：${result.path}`)
    } catch (reason) { setNotice(errorMessage(reason)) }
    finally { exporting.current = false; setBusy(false); setProgress(null) }
  }
  if (!info) return notice ? <p role="status" className="text-xs text-danger">{notice}</p> : null
  return <section aria-label="本机录音" className="my-4 rounded-chip border border-border p-4 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">本机录音{info.status === 'interrupted' ? ' · 中断后已恢复' : ''}</h3><p className="mt-1 text-text-secondary">{formatDuration(info.durationSeconds)} · {(info.bytes / 1024 / 1024).toFixed(1)} MB</p></div>
      <Button size="sm" disabled={busy || info.status === 'recording'} onClick={() => void exportReview()}>导出面试复盘</Button>
      {busy && bridge.recordings?.cancelExport && <Button size="sm" onClick={() => void bridge.recordings?.cancelExport?.(sessionId).catch(reason => setNotice(errorMessage(reason)))}>取消导出</Button>}
    </div>
    <p className="mt-2 text-text-muted">录音在本机识别，不上传音频；仅将转写文字发送给回答模型生成复盘。识别速度取决于录音长度和电脑性能。</p>
    {busy && <p role="status" className="mt-2 text-accent-text">{progress ? `${labels[progress.stage]} ${progress.completed} / ${progress.total}` : '正在准备…'}</p>}
    {notice && <p role="status" className="mt-2 break-all text-text-secondary">{notice}</p>}
  </section>
}
