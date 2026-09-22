import { useEffect, useRef, useState } from 'react'
import { DownloadSimple, Sparkle, Waveform } from '@phosphor-icons/react'
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
  const [downloading, setDownloading] = useState(false)
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
  async function downloadRecording() {
    setDownloading(true); setNotice('')
    try {
      const result = await bridge.recordings?.download(sessionId)
      if (result) setNotice(`录音已保存：${result.path}`)
    } catch (reason) { setNotice(errorMessage(reason)) }
    finally { setDownloading(false) }
  }
  if (!info) return notice ? <p role="status" className="text-xs text-danger">{notice}</p> : null
  return <section aria-label="面试录音" className="my-5 rounded-chip border border-accent-line bg-accent-subtle p-5 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-chip bg-card text-accent-text"><Waveform size={28} aria-hidden="true" /></span>
        <div><h3 className="text-sm font-semibold">面试录音</h3><p className="mt-1 text-text-secondary">{formatDuration(info.durationSeconds)} · {(info.bytes / 1024 / 1024).toFixed(1)} MB · {info.status === 'interrupted' ? '中断后已恢复' : info.status === 'recording' ? '录音中' : '已保存'}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button className="min-h-11" loading={downloading} disabled={busy || info.status === 'recording' || !info.bytes} onClick={() => void downloadRecording()}><DownloadSimple aria-hidden="true" />下载录音</Button>
        <Button variant="primary" className="min-h-11" loading={busy} disabled={downloading || info.status === 'recording' || !info.bytes} onClick={() => void exportReview()}><Sparkle aria-hidden="true" />{busy ? '正在生成复盘' : '生成面试复盘'}</Button>
        {busy && bridge.recordings?.cancelExport && <Button onClick={() => void bridge.recordings?.cancelExport?.(sessionId).catch(reason => setNotice(errorMessage(reason)))}>取消生成</Button>}
      </div>
    </div>
    <p className="mt-3 text-text-secondary">根据录音分析面试表现，生成复盘报告。</p>
    {busy && <p role="status" className="mt-2 text-accent-text">{progress ? `${labels[progress.stage]} ${progress.completed} / ${progress.total}` : '正在准备…'}</p>}
    {notice && <p role="status" className="mt-2 break-all text-text-secondary">{notice}</p>}
  </section>
}
