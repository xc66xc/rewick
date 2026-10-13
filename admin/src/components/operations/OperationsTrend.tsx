import { useEffect, useRef } from 'react'
import { init, use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { timingSource, type OperationsPerformance } from '../../operations'
import layout from '../../pages/OperationsPage.module.css'
use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])
interface Props { trend: OperationsPerformance['trend']; firstContentSource?: 'desktop' | 'backend' | 'unknown' | null }
export default function OperationsTrend({ trend, firstContentSource }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const theme = getComputedStyle(document.documentElement)
    const chart = init(node)
    const sources = [...new Set(trend.map(row => row.source ?? firstContentSource ?? null))]
    const names = sources.map(source => `${timingSource(source)} P95`)
    const series = sources.map(source => ({ name: `${timingSource(source)} P95`, type: 'line', z: 3, symbolSize: 6, data: trend.map(row => (row.source ?? firstContentSource ?? null) === source ? row.p95Ms : null), connectNulls: false }))
    chart.setOption({ color: [theme.getPropertyValue('--color-primary').trim(), theme.getPropertyValue('--color-muted').trim()], tooltip: { trigger: 'axis' }, legend: { top: 0, data: [...names, '样本数'] }, grid: { left: 64, right: 64, bottom: 40, top: 48 }, xAxis: { type: 'category', data: trend.map(row => new Date(row.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })) }, yAxis: [{ type: 'value', name: 'ms' }, { type: 'value', name: '样本', minInterval: 1 }], series: [...series, { name: '样本数', type: 'bar', barMaxWidth: 28, yAxisIndex: 1, data: trend.map(row => row.count) }] })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(node)
    return () => { observer.disconnect(); chart.dispose() }
  }, [trend, firstContentSource])
  return <div ref={ref} className={layout.chart} role="img" aria-label="按时间展示回答 P95 耗时与样本数，未知耗时保留空缺" />
}
