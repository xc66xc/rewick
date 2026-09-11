import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUpRight, Ear, Microphone, Monitor, TextAlignLeft } from '@phosphor-icons/react'
import type { SessionController } from '../hooks/useSession'
import { formatTime } from '../hooks/sessionHelpers'
import RecordingControls from './RecordingControls'
import TranscriptSegmentEditor from './TranscriptSegmentEditor'
import AppendQuestionButton from './AppendQuestionButton'
import { Button } from './ui/button'
import { EmptyState } from './ui/empty-state'
import { LevelMeter } from './ui/meter'
import { cn } from '../lib/cn'

interface TranscriptPanelProps { session: SessionController }
const statusLabels = { idle: '尚未开始', connecting: '正在连接', listening: '正在转写', stopping: '正在结束', error: '连接已中断' }
export default function TranscriptPanel({ session }: TranscriptPanelProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  function handleAppendSegment(id: string) {
    const added = session.appendSegmentToQuestion(id)
    if (added) follow.current = false
    return added
  }
  useEffect(() => {
    const element = viewport.current
    const activeElement = document.activeElement
    const editing = activeElement instanceof HTMLTextAreaElement && element?.contains(activeElement)
    if (follow.current && element && !editing && !session.questionAssembling) element.scrollTop = element.scrollHeight
  }, [session.record.segments, session.questionAssembling])
  return <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-card max-[820px]:min-h-[360px]" aria-labelledby="transcript-title">
    <header className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b border-border px-5"><div className="flex items-center gap-2"><TextAlignLeft size={18} aria-hidden="true" /><h2 id="transcript-title" className="text-sm font-semibold">实时转写</h2></div><div className="flex shrink-0 items-center gap-[7px] text-[11px] text-text-secondary"><LevelMeter level={session.level} /><span role="status">{statusLabels[session.status]}</span><span className="font-mono tracking-[0.04em]">{formatTime(session.elapsed)}</span></div></header>
    <RecordingControls session={session} />
    <div className="min-h-0 flex-1 overflow-y-auto p-5" ref={viewport} onScroll={event => {
      const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70
    }}>
      {session.record.segments.length ? <ol className="m-0 flex list-none flex-col gap-0.5 p-0">{session.record.segments.map((segment, index) => {
        const current = index === session.record.segments.length - 1
        /* v30 .speech:条目常备圆角+内边距; .speech.current:最新一条浅蓝底+1px 蓝内描边 */
        return <li className={cn('group grid grid-cols-[38px_minmax(0,1fr)] gap-3 rounded-chip p-2.5 inset-ring-1 inset-ring-transparent transition-[background-color,box-shadow] duration-150 ease-standard',
          current && 'bg-accent-subtle inset-ring-accent-line')} key={segment.id}>
        <span className="pt-[3px] font-mono text-[10px] text-text-muted">{formatTime(segment.startMs)}</span>
        <div className="flex min-w-0 flex-col items-stretch gap-2">
          <TranscriptSegmentEditor segment={segment} index={index} onBegin={session.beginSegmentEdit} onChange={session.editSegment} onFinish={session.finishSegmentEdit} />
          <div className="flex flex-wrap items-center justify-end gap-2">{segment.isEdited && <span className="mr-auto text-xs text-text-muted">已修改</span>}
            {/* v30 .speech-actions:历史条操作默认收起(max-h-0/透明),悬停本条或条内聚焦 150ms 展开;最新一条常显 */}
            <div className={cn('flex flex-wrap items-center justify-end gap-2 overflow-hidden transition-[max-height,opacity] duration-150 ease-standard',
              current ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0 group-hover:max-h-20 group-hover:opacity-100 group-focus-within:max-h-20 group-focus-within:opacity-100')}>
              <AppendQuestionButton segmentId={segment.id} text={segment.text} disabled={!session.desktop} onAppend={handleAppendSegment} />
              <Button variant="primary" size="xs"
                aria-label={`回答这句：${segment.text}`} disabled={!session.desktop || !segment.text.trim()}
                title={session.busy ? '停止当前生成，并回答这句话' : '针对这句话生成回答'}
                onMouseDown={event => { if (event.button === 0) event.preventDefault() }}
                onClick={event => {
                  // Snapshot visible text before blur applies buffered ASR and can move this button.
                  void session.answerSegment(segment.id)
                  event.currentTarget.focus()
                  // 鼠标触发随即释放焦点,避免焦点钉住本条操作行不随鼠标移开收起;键盘触发保留焦点以便继续 Tab。
                  if (event.detail > 0) event.currentTarget.blur()
                }}>
                回答这句<ArrowUpRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </li>})}</ol> : <div className="flex min-h-full flex-col"><EmptyState className="m-auto" icon={<Ear weight="duotone" />}
          title={session.status === 'listening' ? '正在听，请开始对话' : '对话从这里开始'}
          description={<>选择音频来源并开始转写，<br />面试官的问题会实时显示在这里。</>}>
          <div className="mt-6 grid w-full max-w-[300px] grid-cols-[18px_1fr] items-center gap-x-2 gap-y-1 border-t border-border pt-5 text-left text-xs text-text-muted [&_svg]:size-4">
            <Monitor aria-hidden="true" /><span>系统音频适合线上会议</span>
            <Microphone aria-hidden="true" /><span>麦克风适合练习与线下对话</span>
          </div>
        </EmptyState></div>}
    </div>
    <footer className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3 text-[10px] text-text-muted [&_svg]:ml-auto" id="transcript-help"><span className="size-1 rounded-full bg-border-strong" aria-hidden="true" /><span>点击文字直接修改，已修改的句子保留你的版本</span><ArrowDown size={14} aria-hidden="true" /></footer>
  </section>
}
