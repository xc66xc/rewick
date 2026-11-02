import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/vue'
import OperationTimeline from '../src/views/operations/OperationTimeline.vue'
import OperationsOverview from '../src/views/operations/OperationsOverview.vue'
import OperationsPerformance from '../src/views/operations/OperationsPerformance.vue'
import { orderedLane } from '../src/views/operations/timeline'
import { eventSchema, healthSchema, overviewSchema, performanceSchema, settingsSchema, traceDetailSchema, tracesSchema } from '../src/operations'
import { event, health, overview, performance, settings, spanId, trace, traces } from './operations-fixtures'

describe('Vue migrated monitoring boundary regressions', () => {
  it('orders parents inside one lane, tolerates cycles and never invents missing offsets', () => {
    const child = {...event,eventId:'44444444-4444-4444-8444-444444444444',spanId:'55555555-5555-4555-8555-555555555555',parentSpanId:spanId}
    expect(orderedLane([child,event]).map(row=>row.depth)).toEqual([0,1]);expect(orderedLane([{...event,parentSpanId:child.spanId},child])).toHaveLength(2)
    render(OperationTimeline,{props:{data:{...trace,events:[{...event,offsetMs:undefined}]}}})
    expect(screen.getByText(/偏移 未知/)).toBeTruthy();expect(screen.getByText('未采集该来源，不代表耗时为零。')).toBeTruthy()
    expect(eventSchema.safeParse({...event,source:'external'}).success).toBe(false);expect(eventSchema.safeParse({...event,providerType:'bailian'}).success).toBe(false)
  })
  it('labels DeepSeek retrieval separately and preserves terminal/ASR metadata', () => {
    const web=eventSchema.parse({...event,stage:'retrieval.web',providerType:'deepseek',model:'deepseek-search'})
    render(OperationTimeline,{props:{data:{...trace,events:[web]}}});expect(screen.getByText('服务：DeepSeek 搜索 · deepseek-search')).toBeTruthy()
    expect(eventSchema.parse({...event,stage:'answer.complete',durationMs:2100}).stage).toBe('answer.complete')
    expect(eventSchema.parse({...event,stage:'asr.backlog',providerType:'asr',metadata:{bufferedBytes:4096,maxGapMs:50}}).metadata?.bufferedBytes).toBe(4096)
  })
  it('keeps backend null measurements unknown and optional event fields absent', () => {
    expect(overviewSchema.parse({...overview,performance:Object.fromEntries(Object.keys(overview.performance).map(key=>[key,null]))}).performance.answers).toBeNull()
    expect(healthSchema.parse({...health,storage:{...health.storage,bytes:null},asr:{connections:null,errors:null,firstTranscriptP95Ms:null},runtime:{...health.runtime,connectionsActive:null,connectionsMax:null,connectionsPending:null}}).asr.connections).toBeNull()
    const details=traceDetailSchema.parse({...trace,events:[{...event,parentSpanId:null,offsetMs:null,requestId:null,model:null,serviceSource:null,metadata:null}]})
    expect(details.events[0].offsetMs).toBeUndefined();expect(details.events[0].parentSpanId).toBeUndefined()
    expect(tracesSchema.parse({...traces,items:[{...traces.items[0],model:null,sessionId:null,appVersion:null}]}).items[0].model).toBeUndefined()
  })
  it('validates all reminder threshold bounds', () => {
    for(const thresholds of [{minSamples:19},{minSamples:10001},{sustainSeconds:299},{errorRate:0}])expect(settingsSchema.safeParse({...settings,thresholds:{...settings.thresholds,...thresholds}}).success).toBe(false)
  })
  it('shows real cohort rates with explicit denominators but leaves unsupported client coverage unknown', () => {
    const data={...overview,performance:{...overview.performance,errorRate:.1,degradedRate:.25,retrievalCount:40,retrievalSource:'desktop' as const,tokenCoverage:.75,llmSamples:20,tokenSource:'desktop' as const,errorRateSamples:20,errorRateDenominator:'canonical_attempts_excluding_cancelled_skipped_rejected' as const}}
    render(OperationsOverview,{props:{data}})
    for(const label of ['订单成功率 66.7%','失败率 10.0%','检索降级率 25.0%','Token 覆盖率 75.0%','客户端覆盖率 未知'])expect(screen.getByRole('region',{name:label})).toBeTruthy()
    expect(screen.getByText(/40 次检索请求/)).toBeTruthy();expect(screen.getByText(/原始事件数不等于用户覆盖率/)).toBeTruthy()
  })
  it('ranks slow stages within their source and uses explicit backend quantile precision', () => {
    const stages=performanceSchema.parse({...performance,stages:[performance.stages[1],{...performance.stages[0],stage:'retrieval.rag',p95Ms:100},performance.stages[0],{...performance.stages[1],stage:'llm.complete',p95Ms:2000}],percentileMethod:'histogram_upper_bound',trendSource:'prometheus',comparisonHours:24})
    render(OperationsPerformance,{props:{data:stages,hours:720}})
    const table=screen.getAllByRole('table')[0], rows=within(table).getAllByRole('row').slice(1)
    expect(rows.map(row=>within(row).getAllByRole('cell')[0].textContent)).toEqual(['首段正文','知识库检索','模型回答完成','联网检索'])
    expect(screen.getByText(/阶段耗时不能直接相加/)).toBeTruthy();expect(screen.getByText(/趋势来自 Prometheus/)).toBeTruthy();expect(screen.getByText(/阶段表分位数来自监控数据库直方图桶上界/)).toBeTruthy()
  })
})
