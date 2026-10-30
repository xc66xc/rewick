import { stageNames, milliseconds, outcomeNames, providerTypeNames, type OperationEvent, type TraceDetail } from '../../operations'
import { dateTime } from '../../types'
import styles from '../../styles.module.css'
import layout from '../../pages/OperationsPage.module.css'
interface Props { data: TraceDetail }
export function orderedLane(events: OperationEvent[]) {
  const ordered: { event: OperationEvent; depth: number }[] = []
  const seen = new Set<string>()
  const ids = new Set(events.map(event => event.spanId))
  const sorted = [...events].sort((a, b) => (a.offsetMs ?? Infinity) - (b.offsetMs ?? Infinity))
  function visit(event: OperationEvent, depth: number) {
    if (seen.has(event.eventId)) return
    seen.add(event.eventId); ordered.push({ event, depth: Math.min(depth, 6) })
    sorted.filter(child => child.parentSpanId === event.spanId).forEach(child => visit(child, depth + 1))
  }
  sorted.filter(event => !event.parentSpanId || !ids.has(event.parentSpanId)).forEach(event => visit(event, 0))
  sorted.forEach(event => visit(event, 0))
  return ordered
}
export default function OperationTimeline({ data }: Props) {
  return <section className={layout.panel} aria-label="操作时间线"><h3>操作时间线</h3><p className={styles.code}>{data.operationId}</p><p className={styles.hint}>客户端与后端使用独立单调时钟，泳道内显示相对操作起点。泳道之间不可相减，不推断网络耗时。起始时刻仅用于展示。</p>{data.partial && <p className={styles.warning}>链路不完整：可能存在采集关闭、旧客户端、丢弃或已过保留期的阶段。</p>}{!data.partial && <p className={styles.hint}>当前未标记阶段缺失；仅此标记无法确认全部客户端、后端与渲染阶段均已采集，完整性仍未知。</p>}
    {(['desktop', 'backend'] as const).map(source => {
      const events = data.events.filter(event => event.source === source)
      const duration = Math.max(1, ...events.map(event => (event.offsetMs ?? 0) + event.durationMs))
      return <section key={source} className={layout.lane} aria-label={source === 'desktop' ? '客户端泳道' : '后端泳道'}><h3>{source === 'desktop' ? '客户端报告' : '后端测量'} · 各自起点</h3><p className={styles.hint}>此泳道范围：0–{milliseconds(duration)}（独立刻度）</p>{!events.length && <p className={styles.hint}>未采集该来源，不代表耗时为零。</p>}{orderedLane(events).map(({ event, depth }) => <article className={layout.span} key={event.eventId}><div style={{ paddingInlineStart: depth * 12 }}><strong>{stageNames[event.stage]}</strong><span className={styles.tableDetail}>{outcomeNames[event.outcome]} · {milliseconds(event.durationMs)}</span><span className={styles.tableDetail}>服务：{providerTypeNames[event.providerType]}{event.model ? ` · ${event.model}` : ''}</span><span className={styles.tableDetail}>偏移 {event.offsetMs === undefined ? '未知' : milliseconds(event.offsetMs)} · {dateTime(event.startedAt)}</span>{event.parentSpanId && <span className={styles.tableDetail}>父 span：{event.parentSpanId}</span>}{event.reason && <span className={styles.tableDetail}>分类：{event.reason}</span>}<span className={styles.tableDetail}>span：{event.spanId}</span>{event.metadata && <div className={layout.metadata}>{Object.entries(event.metadata).map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}</div>}</div><div className={layout.track} aria-label={`${stageNames[event.stage]}相对耗时条`}>{event.offsetMs !== undefined && <div className={`${layout.bar} ${['error', 'timeout', 'rejected'].includes(event.outcome) ? layout.errorBar : ''}`} style={{ left: `${event.offsetMs / duration * 100}%`, width: `${event.durationMs / duration * 100}%` }} />}</div></article>)}</section>
    })}</section>
}
