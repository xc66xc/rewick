import LocalRecording from './LocalRecording'
import { Collapse } from './ui/collapsible'
import { interviewTypeLabels } from '../../../shared/interview-type'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ClockCounterClockwise, DownloadSimple, CaretRight, Eye, TextAlignLeft, Trash } from '@phosphor-icons/react'
import type { DesktopBridge, SessionRecord, SessionExportOptions } from '../../../shared/types'
import AnswerCard from './AnswerCard'
import { formatDuration } from '../hooks/useInterviewTime'
import SessionContextDetails from './SessionContextDetails'
import DeleteSessionDialog from './DeleteSessionDialog'
import { Button, buttonDangerClass } from './ui/button'
import ExportSessionDialog from './ExportSessionDialog'
import { Eyebrow } from './ui/pill'
import { EmptyState } from './ui/empty-state'
import { cn } from '../lib/cn'
import { textButtonClass } from '../lib/form'

interface HistoryPageProps {
  bridge?: DesktopBridge; records: SessionRecord[]; activeSessionId: string; activeSessionLocked: boolean
  onExport: (record: SessionRecord, options: SessionExportOptions) => Promise<void>; onDelete: (id: string) => Promise<void>
}
function usage(record: SessionRecord) { return record.usedSeconds === undefined ? '—' : formatDuration(record.usedSeconds) }
function formatDate(value: string) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
export default function HistoryPage({ bridge, records: initialRecords, activeSessionId, activeSessionLocked, onExport, onDelete }: HistoryPageProps) {
  const [records, setRecords] = useState(initialRecords)
  const [selected, setSelected] = useState<SessionRecord | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const cursor = cursors[cursors.length - 1]
  const generation = useRef(0)
  async function loadPage(value?: number) {
    if (!bridge) return
    const request = ++generation.current
    setLoading(true)
    try {
      const page = await bridge.getHistoryPage(value)
      if (request !== generation.current) return
      setRecords(page.records); setNextCursor(page.nextCursor)
    } catch (error) { setNotice(error instanceof Error ? error.message : '加载失败') }
    finally { if (request === generation.current) setLoading(false) }
  }
  async function openRecord(record: SessionRecord) {
    setNotice(''); setLoading(true)
    try { setSelected(bridge ? await bridge.getHistoryDetail(record.id) : record) }
    catch (error) { setNotice(error instanceof Error ? error.message : '加载失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { if (bridge) void loadPage(cursor); else setRecords(initialRecords); return () => { generation.current++ } }, [bridge, cursor, initialRecords])
  const [pendingDelete, setPendingDelete] = useState<SessionRecord | null>(null)
  const [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (notice) heading.current?.focus() }, [notice])
  function handleDeleted() {
    if (!pendingDelete) return
    setSelected(null); setRecords(items => items.filter(item => item.id !== pendingDelete.id)); setPendingDelete(null); setNotice(`已删除「${pendingDelete.title}」。`)
  }
  function handleDeleteRequest(record: SessionRecord) { setNotice(''); setPendingDelete(record) }
  async function handleExportAnswersExcel() {
    if (!selected || !bridge?.exportAnswersExcel || exportingExcel) return
    setExportingExcel(true)
    setNotice('')
    try {
      if (await bridge.exportAnswersExcel(selected.id)) setNotice('回答 Excel 已导出，reference 已留空，填写标准答案后可用于评估。')
    } catch (error) { setNotice(error instanceof Error ? error.message : '导出回答 Excel 失败') }
    finally { setExportingExcel(false) }
  }
  function locked(id: string) { return activeSessionLocked && id === activeSessionId }
  const lockedHint = '请先停止当前会话的转写或回答，再删除记录。'
  return <section className="flex-1 p-8 max-[820px]:p-5" aria-labelledby="history-title">
    <header className="mb-8 flex items-center justify-between gap-5 max-[820px]:items-start max-[560px]:flex-wrap"><div><Eyebrow>回看每一次表达</Eyebrow><h1 ref={heading} id="history-title" tabIndex={-1} className="mb-2 text-[28px] leading-[1.3] font-semibold tracking-[-0.04em] max-[820px]:text-2xl">会话记录</h1><p className="text-xs text-text-muted">保存在账号中，可跨设备回顾或导出。</p></div><span className="rounded-chip border border-border bg-card px-3 py-2 text-xs text-text-secondary">{records.length} 场会话</span></header>
    {bridge && !selected && <div className="mb-4 flex items-center gap-3"><Button disabled={loading} onClick={() => void loadPage(cursor)}>刷新</Button><Button disabled={loading || cursors.length === 1} onClick={() => setCursors(values => values.slice(0, -1))}>上一页</Button><Button disabled={loading || nextCursor === null} onClick={() => { if (nextCursor !== null) setCursors(values => [...values, nextCursor]) }}>下一页</Button>{loading && <span role="status">加载中…</span>}</div>}
    {notice && <p className="mb-4 text-xs text-success [overflow-wrap:anywhere]" role="status">{notice}</p>}
    {selected ? <div className="rounded-card border border-border bg-card p-6"><div className="mb-6 flex items-center justify-between gap-4"><button className={textButtonClass} onClick={() => setSelected(null)}><ArrowLeft size={17} />返回记录</button>
      <div className="flex flex-wrap items-center justify-end gap-3">{import.meta.env.DEV && bridge?.exportAnswersExcel && <Button className="min-h-11" disabled={exportingExcel || !selected.answers.some(answer => answer.text.trim())} onClick={() => void handleExportAnswersExcel()}><DownloadSimple size={17} aria-hidden="true" />{exportingExcel ? '正在导出…' : '导出回答 Excel'}</Button>}<Button className="min-h-11" onClick={() => setExporting(true)}><DownloadSimple size={17} aria-hidden="true" />导出会话记录</Button>
        <Button variant="default" size="sm" className={cn(buttonDangerClass, 'text-danger')} disabled={locked(selected.id)} title={locked(selected.id) ? lockedHint : undefined} onClick={() => handleDeleteRequest(selected)}><Trash aria-hidden="true" />删除会话</Button></div></div>
      <h2 className="mb-2 text-xl">{selected.title}</h2><p className="mb-5 text-xs text-text-muted">{formatDate(selected.createdAt)} · {selected.answers.length} 个回答 · 使用时长 {usage(selected)}</p>
      {bridge?.recordings && <LocalRecording key={selected.id} bridge={bridge} sessionId={selected.id} />}
      <SessionContextDetails record={selected} />
      {selected.segments.length > 0 && <Collapse className="my-5 p-4" summary={<><CaretRight size={16} aria-hidden="true" /><TextAlignLeft size={17} aria-hidden="true" />查看转写全文</>}><div>{selected.segments.map(segment => <p key={segment.id} className="mt-3 whitespace-pre-wrap">{segment.text}</p>)}</div></Collapse>}
      {selected.answers.map((answer, index) => <AnswerCard key={answer.id} answer={answer.status === 'streaming' && selected.id !== activeSessionId ? { ...answer, status: 'cancelled' } : answer} index={index + 1} />)}</div>
      : records.length ? <div className="overflow-hidden rounded-card border border-border bg-card">
        {/* v30 表格卡:表头行(面试/会话|开始时间|使用时长|转写|回答|操作) + grid 列行;≤560px 收为「标题 + 删除」两列 */}
        <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(100px,0.9fr)_minmax(80px,0.8fr)_minmax(48px,0.5fr)_minmax(48px,0.5fr)_minmax(168px,1fr)] gap-4 border-b border-border bg-subtle px-6 py-3 text-xs text-text-muted max-[820px]:px-5 max-[560px]:hidden">
          <span>面试 / 会话</span><span>开始时间</span><span>使用时长</span><span>转写</span><span>回答</span><span>操作</span>
        </div>
        {records.map(record => {
          const displayTitle = record.interviewEnvironment?.name || record.title
          return <div key={record.id} className="grid grid-cols-[minmax(0,2.2fr)_minmax(100px,0.9fr)_minmax(80px,0.8fr)_minmax(48px,0.5fr)_minmax(48px,0.5fr)_minmax(168px,1fr)] items-center gap-4 border-b border-border px-6 py-5 last:border-b-0 hover:bg-subtle max-[820px]:px-5 max-[560px]:grid-cols-[minmax(0,1fr)_auto] max-[560px]:gap-3 max-[560px]:px-4">
          <button type="button" className="flex min-w-0 items-center gap-3 bg-transparent text-left text-inherit" onClick={() => { void openRecord(record) }}>
            <span className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium">{displayTitle}</h2>{record.interviewEnvironment?.interviewType && <p className="mt-1 text-xs text-text-secondary">{interviewTypeLabels[record.interviewEnvironment.interviewType]}</p>}<p className="mt-1 text-xs text-text-secondary min-[561px]:hidden">使用时长 {usage(record)}</p></span></button>
          <span className="text-xs text-text-secondary max-[560px]:hidden">{formatDate(record.createdAt)}</span>
          <span className="text-xs text-text-secondary tabular-nums max-[560px]:hidden">{usage(record)}</span>
          <span className="text-xs text-text-secondary max-[560px]:hidden">{record.segmentCount ?? record.segments.length} 段</span>
          <span className="text-xs text-text-secondary max-[560px]:hidden">{record.answerCount ?? record.answers.length} 个</span>
          <div className="flex items-center gap-2">
            <Button size="sm" aria-label={`查看详情：${displayTitle}`} onClick={() => { void openRecord(record) }}><Eye aria-hidden="true" />查看详情</Button>
            <Button variant="default" size="sm" className={cn(buttonDangerClass, 'text-danger')} aria-label={`删除会话：${displayTitle}`} disabled={locked(record.id)} title={locked(record.id) ? lockedHint : '删除会话'} onClick={() => handleDeleteRequest(record)}><Trash aria-hidden="true" />删除</Button>
          </div>
        </div> })}
      </div>
        : <EmptyState icon={<ClockCounterClockwise weight="duotone" />} title="你的第一场会话，即将开始" description="结束转写或完成回答后，会话会自动保存在这里。" className="min-h-[400px] justify-center rounded-card border border-dashed border-border-strong" />}
    {exporting && selected && <ExportSessionDialog onClose={() => setExporting(false)} onExport={options => { setExporting(false); void onExport(selected, options) }} />}
    {pendingDelete && <DeleteSessionDialog record={pendingDelete} isCurrent={pendingDelete.id === activeSessionId} locked={locked(pendingDelete.id)} onDelete={onDelete} onClose={() => setPendingDelete(null)} onDeleted={handleDeleted} />}
  </section>
}
