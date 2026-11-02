import { useEffect, useRef, useState } from 'react'
import { DownloadSimple, Sparkle, Waveform } from '@phosphor-icons/react'
import type { DesktopBridge } from '../../../shared/types'
import type { RecordingInfo, RecordingProgress, RecordingResourceStatus } from '../../../shared/recording-types'
import { formatDuration } from '../hooks/useInterviewTime'
import { errorMessage } from '../hooks/useSettings'
import { Button } from './ui/button'
import RecordingResourceConsent, { resourceSize } from './RecordingResourceConsent'

interface Props { bridge: DesktopBridge; sessionId: string }
const labels = { transcribing: '正在本机识别录音', summarizing: '正在生成复盘', exporting: '正在导出', downloading: '正在下载语音资源', verifying: '正在校验语音资源', extracting: '正在解压语音资源', checking: '正在检查语音环境' }
function progressLabel(progress: RecordingProgress): string {
  const label = labels[progress.stage]
  if (progress.stage === 'downloading') {
    const downloaded = resourceSize(progress.downloadedBytes ?? 0)
    return progress.totalBytes && progress.totalBytes > 0 ? `${label} ${downloaded} / ${resourceSize(progress.totalBytes)}` : `${label} ${downloaded}`
  }
  return ['verifying', 'extracting', 'checking'].includes(progress.stage) ? label : `${label} ${progress.completed} / ${progress.total}`
}
export default function LocalRecording({ bridge, sessionId }: Props) {
  const [info, setInfo] = useState<RecordingInfo | null>(null)
  const [progress, setProgress] = useState<RecordingProgress | null>(null)
  const [requirements, setRequirements] = useState<RecordingResourceStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [notice, setNotice] = useState('')
  const exporting = useRef(false)
  const working = useRef(false)
  const generation = useRef(0)
  const preparation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    setInfo(null); setNotice(''); setProgress(null); setRequirements(null); setBusy(false)
    void bridge.recordings?.info(sessionId).then(value => { if (generation.current === current) setInfo(value) }).catch(reason => { if (generation.current === current) setNotice(errorMessage(reason)) })
    const off = bridge.onEvent(event => { if (generation.current === current && event.kind === 'recording-progress' && event.sessionId === sessionId) setProgress(event) })
    return () => {
      generation.current++; preparation.current++; off(); working.current = false
      if (exporting.current) void bridge.recordings?.cancelExport?.(sessionId).catch(() => undefined)
      exporting.current = false
    }
  }, [bridge, sessionId])
  async function exportReview(allowResourceDownload: boolean, current: number) {
    exporting.current = true
    const result = await bridge.recordings?.exportReview(sessionId, { allowResourceDownload })
    if (generation.current === current && result) setNotice(`复盘已导出：${result.path}`)
  }
  async function prepareExport(allowResourceDownload = false) {
    if (working.current) return
    working.current = true
    const current = generation.current
    const attempt = ++preparation.current
    setBusy(true); setNotice(''); setProgress(null)
    try {
      if (!allowResourceDownload) {
        const status = await bridge.recordings?.resourceStatus()
        if (generation.current !== current || preparation.current !== attempt) return
        if (status && !status.ready) { setRequirements(status); return }
      }
      setRequirements(null)
      await exportReview(allowResourceDownload, current)
    } catch (reason) { if (generation.current === current && preparation.current === attempt) setNotice(errorMessage(reason)) }
    finally {
      if (generation.current === current && preparation.current === attempt) { exporting.current = false; working.current = false; setBusy(false); setProgress(null) }
    }
  }
  async function cancelExport() {
    if (exporting.current) {
      try { await bridge.recordings?.cancelExport?.(sessionId) } catch (reason) { setNotice(errorMessage(reason)) }
    } else {
      preparation.current++; working.current = false; setBusy(false); setNotice('已取消准备。')
    }
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
        <Button className="min-h-11" loading={downloading} disabled={busy || requirements !== null || info.status === 'recording' || !info.bytes} onClick={() => void downloadRecording()}><DownloadSimple aria-hidden="true" />下载录音</Button>
        <Button variant="primary" className="min-h-11" loading={busy} disabled={downloading || requirements !== null || info.status === 'recording' || !info.bytes} onClick={() => void prepareExport()}><Sparkle aria-hidden="true" />{busy ? '正在生成复盘' : '生成面试复盘'}</Button>
        {busy && bridge.recordings?.cancelExport && <Button onClick={() => void cancelExport()}>取消生成</Button>}
      </div>
    </div>
    <p className="mt-3 text-text-secondary">根据录音分析面试表现，生成复盘报告。</p>
    {busy && <p role="status" aria-live="polite" className="mt-2 text-accent-text">{progress ? progressLabel(progress) : '正在准备…'}</p>}
    {notice && <p role="status" aria-live="polite" className="mt-2 break-all text-text-secondary">{notice}</p>}
    <RecordingResourceConsent status={requirements} onCancel={() => setRequirements(null)} onConfirm={() => void prepareExport(true)} />
  </section>
}
