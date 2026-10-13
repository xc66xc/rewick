import { useEffect, useState } from 'react'
import { ArrowClockwise, GearSix } from '@phosphor-icons/react'
import type { ApiClient } from '../api'
import { overviewSchema, performanceSchema, healthSchema } from '../operations'
import OperationsOverview from '../components/operations/OperationsOverview'
import OperationsPerformance from '../components/operations/OperationsPerformance'
import OperationsHealth from '../components/operations/OperationsHealth'
import OperationsTraces, { type TraceSelection } from '../components/operations/OperationsTraces'
import OperationsResourcePanel from '../components/operations/OperationsResourcePanel'
import OperationsSettings from '../components/operations/OperationsSettings'
import ErrorBoundary from '../components/ErrorBoundary'
import styles from '../styles.module.css'
import tabs from './ConfigPage.module.css'
import layout from './OperationsPage.module.css'
interface Props { api: ApiClient; active?: boolean; initialTrace?: TraceSelection }
const sections = { overview: '总览', performance: '性能', traces: '操作链路', health: '健康' } as const
type Tab = keyof typeof sections
export default function OperationsPage({ api, active = true, initialTrace }: Props) {
  const [tab, setTab] = useState<Tab>(initialTrace ? 'traces' : 'overview')
  const [hours, setHours] = useState(24)
  const [settings, setSettings] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => { if (initialTrace) setTab('traces') }, [initialTrace])
  const path = `/admin/operations/${tab}?hours=${hours}`
  return <section className={styles.pageBody} aria-label="运营观测"><div className={styles.sectionHeading}><div><h2>运营观测</h2><p>业务趋势、回答延迟与运行健康</p></div><div className={styles.actions}><button className={styles.secondaryButton} onClick={() => setRevision(value => value + 1)}><ArrowClockwise size={18} />刷新观测</button><button className={styles.secondaryButton} onClick={() => setSettings(true)}><GearSix size={18} />观测设置</button></div></div><div className={layout.toolbar}><label className={styles.field}>时间范围<select value={hours} onChange={event => { setHours(Number(event.target.value)); setRevision(value => value + 1) }}><option value={24}>最近 24 小时</option><option value={168}>最近 7 天</option><option value={720}>最近 30 天</option><option value={2160}>最近 90 天</option></select></label><p className={styles.hint}>可见页面每 30 秒刷新；页面隐藏时停止轮询。链路明细限最近 7 天。</p></div><div className={tabs.tabs} role="group" aria-label="观测页签">{Object.entries(sections).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key as Tab)}>{label}</button>)}</div><ErrorBoundary><div className={styles.pageBody} key={`${tab}:${hours}:${revision}:${initialTrace?.operationId ?? initialTrace?.userId ?? ''}`}>
    {tab === 'overview' && <OperationsResourcePanel api={api} path={path} schema={overviewSchema} active={active}>{data => <OperationsOverview data={data} />}</OperationsResourcePanel>}
    {tab === 'performance' && <OperationsResourcePanel api={api} path={path} schema={performanceSchema} active={active}>{data => <OperationsPerformance data={data} hours={hours} />}</OperationsResourcePanel>}
    {tab === 'health' && <OperationsResourcePanel api={api} path="/admin/operations/health" schema={healthSchema} active={active}>{data => <OperationsHealth data={data} />}</OperationsResourcePanel>}
    {tab === 'traces' && <OperationsTraces api={api} hours={hours} active={active} initial={initialTrace} />}
  </div></ErrorBoundary>{settings && active && <OperationsSettings api={api} onClose={() => setSettings(false)} onSaved={() => setRevision(value => value + 1)} />}</section>
}
