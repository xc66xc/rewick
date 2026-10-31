import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OperationsTraces from '../src/components/operations/OperationsTraces'
import OperationsPage from '../src/pages/OperationsPage'
import OperationTimeline, { orderedLane } from '../src/components/operations/OperationTimeline'
import { ApiClient } from '../src/api'
import { eventSchema, healthSchema, overviewSchema, performanceSchema, settingsSchema, traceDetailSchema, tracesSchema, orderSuccess, percentage } from '../src/operations'
import UsagePage from '../src/pages/UsagePage'
import { page, response } from './fixtures'
import { event, health, operationId, overview, performance, settings, spanId, trace, traces } from './operations-fixtures'
vi.mock('../src/components/operations/OperationsTrend', () => ({ default: () => <div role="img" aria-label="延迟趋势" /> }))
function setup({ unavailable = false, conflict = false } = {}) {
  const calls: string[] = []
  const publications: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    calls.push(url)
    if (unavailable) return response({ message: 'Unavailable' }, 503)
    if (url.includes('/settings')) {
      if (options.method === 'PUT') { const body = JSON.parse(String(options.body)); publications.push(body); return conflict ? response({ message: 'Version conflict' }, 409) : response({ ...body, version: 2 }) }
      return response(settings)
    }
    if (url.includes('/overview')) return response(overview)
    if (url.includes('/performance')) return response(performance)
    if (url.includes('/health')) return response(health)
    if (url.includes(`/traces/${operationId}`)) return response(trace)
    if (url.includes('/traces?')) return response(traces)
    throw new Error(`Unhandled mock ${url}`)
  }))
  const api = new ApiClient('test-token')
  const view = render(<OperationsPage api={api} />)
  return { actor: userEvent.setup(), calls, publications, api, view }
}
describe('operations monitoring', () => {
  it('distinguishes sync failures from answers and labels client versions explicitly', async () => {
    const items = [
      { ...traces.items[0], operationType: 'session-sync', model: null, outcome: 'error', appVersion: '2.0.8' },
      { ...traces.items[0], operationId: '11111111-1111-4111-8111-111111111112', operationType: 'answer', model: null },
      { ...traces.items[0], operationId: '11111111-1111-4111-8111-111111111113', operationType: 'asr', model: 'speech-model' },
      { ...traces.items[0], operationId: '11111111-1111-4111-8111-111111111114', operationType: undefined }
    ]
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...traces, items, total: 4 })))
    render(<OperationsTraces api={new ApiClient('token')} hours={24} active />)
    const table = await screen.findByRole('table', { name: '最近操作 · 最多 7 天' })
    expect(within(table).getByRole('columnheader', { name: '模型 / 客户端版本' })).toBeTruthy()
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('会话同步')).toBeTruthy()
    expect(within(rows[0]).getByText('不涉及模型')).toBeTruthy()
    expect(within(rows[0]).getByText('失败')).toBeTruthy()
    expect(within(rows[0]).getByText('客户端 2.0.8')).toBeTruthy()
    expect(within(rows[1]).getByText('未上报')).toBeTruthy()
    expect(within(rows[2]).getByText('语音转写')).toBeTruthy()
    expect(within(rows[2]).getByText('speech-model')).toBeTruthy()
    expect(within(rows[3]).getByText('其他操作')).toBeTruthy()
    expect(within(table).queryByText('未知')).toBeNull()
  })
  it('accepts legacy operation types and explains safe sync conflict reasons', () => {
    const parsed = tracesSchema.parse({ ...traces, items: [{ ...traces.items[0], operationType: null }] })
    expect(parsed.items[0].operationType).toBe('other')
    expect(tracesSchema.safeParse({ ...traces, items: [{ ...traces.items[0], operationType: 'invented' }] }).success).toBe(false)
    render(<OperationTimeline data={{ ...trace, events: [
      { ...event, stage: 'session.sync', outcome: 'rejected', reason: 'record_changed' },
      { ...event, eventId: '33333333-3333-4333-8333-333333333334', stage: 'session.sync', outcome: 'rejected', reason: 'record_deleted' }
    ] }} />)
    expect(screen.getByText('分类：云端记录版本已变化')).toBeTruthy()
    expect(screen.getByText('分类：云端记录已删除')).toBeTruthy()
  })
  it('starts at 24 hours, presents real business data and explicit unknown values', async () => {
    const { actor, calls } = setup()
    await screen.findByRole('region', { name: '业务概览' })
    expect(calls[0]).toContain('/overview?hours=24')
    expect(screen.getByText('¥ 190.00')).toBeTruthy()
    expect(screen.getByText(/不代表利润/)).toBeTruthy()
    expect(screen.getByText(/北京时间当天开始面试的普通用户/)).toBeTruthy()
    expect(screen.getByText(/首段正文 P95 统计来源：客户端报告/)).toBeTruthy()
    await actor.selectOptions(screen.getByLabelText('时间范围'), '2160')
    await waitFor(() => expect(calls.some(url => url.endsWith('/overview?hours=2160'))).toBe(true))
  })
  it('shows unknown and stale business snapshots without inventing zeros', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ ...overview, stale: true, business: { ...overview.business, activeUsers: null, paidCents: null, updatedAt: null, stale: true } })))
    render(<OperationsPage api={new ApiClient('token')} />)
    const business = within(await screen.findByRole('region', { name: '业务概览' }))
    expect(business.getByText('数据未知')).toBeTruthy()
    expect(business.getAllByText('未知').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('数据已过期')).toBeTruthy()
  })
  it('renders low-sample percentiles and lazily loaded performance trends', async () => {
    const { actor } = setup()
    await actor.click(screen.getByRole('button', { name: '性能' }))
    await screen.findByRole('img', { name: '延迟趋势' })
    expect(screen.getByText('样本不足 100')).toBeTruthy()
    expect(screen.getByText('后端测量')).toBeTruthy()
    await actor.selectOptions(screen.getByLabelText('时间范围'), '2160')
    await screen.findByText(/监控直方图估算/)
    expect(performanceSchema.safeParse({ ...performance, stages: [{ ...performance.stages[0], p95Ms: -1 }] }).success).toBe(false)
  })
  it('filters traces, caps detail search at seven days and keeps separate clocks and parent identifiers', async () => {
    const { actor, calls } = setup()
    await actor.selectOptions(screen.getByLabelText('时间范围'), '2160')
    await actor.click(screen.getByRole('button', { name: '操作链路' }))
    await screen.findByRole('button', { name: '查看链路' })
    const listUrl = calls.find(url => url.includes('/traces?')) ?? ''
    expect(listUrl).not.toContain('sessionId=')
    expect(listUrl).not.toContain('model=')
    expect(listUrl).not.toContain('appVersion=')
    await actor.type(screen.getByLabelText('用户 ID'), '7')
    await actor.type(screen.getByLabelText('模型'), '中文 model')
    await actor.click(screen.getByRole('button', { name: '筛选链路' }))
    await waitFor(() => expect(calls.some(url => url.includes('userId=7') && url.includes('model=%E4%B8%AD%E6%96%87+model') && url.includes('hours=168'))).toBe(true))
    await actor.click(await screen.findByRole('button', { name: '查看链路' }))
    await screen.findByRole('region', { name: '操作时间线' })
    expect(screen.getByText(/链路不完整/)).toBeTruthy()
    expect(screen.getByRole('region', { name: '客户端泳道' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '后端泳道' })).toBeTruthy()
    expect(screen.getByText(/泳道之间不可相减/)).toBeTruthy()
    expect(screen.getByText(`父 span：${spanId}`)).toBeTruthy()
    expect(calls.some(url => url.includes(`/traces/${operationId}?userId=7`))).toBe(true)
  })
  it('rejects invalid operation IDs before requesting a detail', async () => {
    const { actor, calls } = setup()
    await actor.click(screen.getByRole('button', { name: '操作链路' }))
    await actor.type(screen.getByLabelText('操作 ID'), 'invalid-uuid')
    await actor.click(screen.getByRole('button', { name: '查看指定操作' }))
    await screen.findByRole('alert')
    expect(calls.some(url => url.includes('/traces/'))).toBe(false)
  })
  it('shows capacity, unknown ASR latency and sustained page alerts', async () => {
    const { actor } = setup()
    await actor.click(screen.getByRole('button', { name: '健康' }))
    await screen.findByText('采集队列积压')
    expect(screen.getByText('持续观察')).toBeTruthy()
    expect(screen.getByText(/实时读数/)).toBeTruthy()
    expect(screen.getByText(/是软预算/)).toBeTruthy()
    expect(screen.getByText('监控自身失败')).toBeTruthy()
    expect(screen.getByText(/明细保留 7 天/)).toBeTruthy()
    expect(screen.getAllByText('未知').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('不可用')).toBeTruthy()
  })
  it('shows monitoring outage as an error rather than an empty dashboard', async () => {
    setup({ unavailable: true })
    expect((await screen.findByRole('alert')).textContent).toContain('运营观测暂不可用')
    expect(screen.queryByRole('region', { name: '业务概览' })).toBeNull()
  })
  it('publishes explicit collection, deduplicated gray users and reminder thresholds', async () => {
    const { actor, publications } = setup()
    await actor.click(screen.getByRole('button', { name: '观测设置' }))
    const dialog = within(await screen.findByRole('dialog', { name: '运营观测设置' }))
    const enabled = await dialog.findByLabelText('开启采集')
    expect(enabled).toHaveProperty('checked', false)
    expect(dialog.getByText(/灰度名单为空时采集所有用户/)).toBeTruthy()
    await actor.click(enabled)
    await actor.type(dialog.getByLabelText(/灰度用户 ID/), '7, 8\n7')
    await actor.clear(dialog.getByLabelText('首段正文 P95 阈值（毫秒）')); await actor.type(dialog.getByLabelText('首段正文 P95 阈值（毫秒）'), '10000')
    await actor.click(dialog.getByRole('button', { name: '保存观测设置' }))
    expect((await dialog.findByRole('status')).textContent).toContain('版本 2')
    expect(publications[0]).toMatchObject({ version: 1, enabled: true, allowedUserIds: ['7', '8'], thresholds: { firstContentP95Ms: 10000 } })
  })
  it('preserves the settings draft on a version conflict', async () => {
    const { actor } = setup({ conflict: true })
    await actor.click(screen.getByRole('button', { name: '观测设置' }))
    const dialog = within(await screen.findByRole('dialog', { name: '运营观测设置' }))
    await actor.click(await dialog.findByLabelText('开启采集'))
    await actor.type(dialog.getByLabelText(/灰度用户 ID/), '7')
    await actor.click(dialog.getByRole('button', { name: '保存观测设置' }))
    expect((await dialog.findByRole('alert')).textContent).toContain('当前草稿已保留')
    expect(dialog.getByLabelText(/灰度用户 ID/)).toHaveProperty('value', '7')
  })
  it('stops requests on inactive pages and refreshes upon resuming', async () => {
    const { calls, view, api } = setup()
    await screen.findByRole('region', { name: '业务概览' })
    const initial = calls.length
    view.rerender(<OperationsPage api={api} active={false} />)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(calls).toHaveLength(initial)
    view.rerender(<OperationsPage api={api} active />)
    await waitFor(() => expect(calls.length).toBe(initial + 1))
  })
  it('labels DeepSeek web retrieval separately from answer-model events', () => {
    const web = eventSchema.parse({ ...event, stage: 'retrieval.web', providerType: 'deepseek', model: 'deepseek-search' })
    render(<OperationTimeline data={{ ...trace, events: [web] }} />)
    expect(screen.getByText('服务：DeepSeek 搜索 · deepseek-search')).toBeTruthy()
  })
  it('orders parent spans within one lane and tolerates cycles and absent offsets', () => {
    const child = { ...event, eventId: '44444444-4444-4444-8444-444444444444', spanId: '55555555-5555-4555-8555-555555555555', parentSpanId: spanId }
    expect(orderedLane([child, event]).map(row => row.depth)).toEqual([0, 1])
    expect(orderedLane([{ ...event, parentSpanId: child.spanId }, child])).toHaveLength(2)
    render(<OperationTimeline data={{ ...trace, events: [{ ...event, offsetMs: undefined }] }} />)
    expect(screen.getByText('偏移 未知', { exact: false })).toBeTruthy()
    expect(screen.getByText(/未采集该来源/)).toBeTruthy()
    expect(eventSchema.safeParse({ ...event, source: 'external' }).success).toBe(false)
    expect(eventSchema.safeParse({ ...event, providerType: 'bailian' }).success).toBe(false)
    expect(eventSchema.parse({ ...event, providerType: 'deepseek', stage: 'retrieval.web' }).providerType).toBe('deepseek')
  })
  it('accepts nullable backend measurements as unknown and nullable event fields as absent', () => {
    const parsed = overviewSchema.parse({ ...overview, performance: Object.fromEntries(Object.keys(overview.performance).map(key => [key, null])) })
    expect(parsed.performance.answers).toBeNull()
    const unavailable = healthSchema.parse({ ...health, storage: { ...health.storage, bytes: null }, asr: { connections: null, errors: null, firstTranscriptP95Ms: null }, runtime: { ...health.runtime, connectionsActive: null, connectionsMax: null, connectionsPending: null } })
    expect(unavailable.asr.connections).toBeNull()
    const details = traceDetailSchema.parse({ ...trace, events: [{ ...event, parentSpanId: null, offsetMs: null, requestId: null, model: null, serviceSource: null, metadata: null }] })
    expect(details.events[0].offsetMs).toBeUndefined()
    expect(details.events[0].parentSpanId).toBeUndefined()
    expect(tracesSchema.parse({ ...traces, items: [{ ...traces.items[0], model: null, sessionId: null, appVersion: null }] }).items[0].model).toBeUndefined()
  })
  it('uses backend quantile method and comparison window instead of inferring precision', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.includes('/performance') ? { ...performance, percentileMethod: 'histogram_upper_bound', trendSource: 'operations_database', comparisonHours: 168 } : overview)))
    const actor = userEvent.setup()
    render(<OperationsPage api={new ApiClient('token')} />)
    await actor.click(screen.getByRole('button', { name: '性能' }))
    await screen.findByText(/直方图桶上界估算/)
    expect(screen.getByText('模型与版本对比 · 最近 168 小时')).toBeTruthy()
    expect(screen.getByText(/趋势来源：监控数据库/)).toBeTruthy()
  })
  it('separates Prometheus interpolated trend quantiles from SQL stage bucket bounds', async () => {
    const payload = { ...performance, percentileMethod: 'histogram_upper_bound', trendSource: 'prometheus', firstContentSource: 'backend', trend: performance.trend.map(row => ({ ...row, source: 'backend' })) }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.includes('/performance') ? payload : overview)))
    const actor = userEvent.setup()
    render(<OperationsPage api={new ApiClient('token')} />)
    await actor.click(screen.getByRole('button', { name: '性能' }))
    await screen.findByText(/阶段表分位数来自监控数据库直方图桶上界估算/)
    expect(screen.getByText(/趋势来自 Prometheus，P95 按直方图桶插值估算/)).toBeTruthy()
    expect(performanceSchema.parse(payload).trend[0].source).toBe('backend')
  })
  it('accepts the canonical answer terminal stage and ASR buffered bytes without losing payload fields', () => {
    const terminal = eventSchema.parse({ ...event, stage: 'answer.complete', durationMs: 2100 })
    expect(terminal.stage).toBe('answer.complete')
    const backlog = eventSchema.parse({ ...event, stage: 'asr.backlog', providerType: 'asr', metadata: { bufferedBytes: 4096, maxGapMs: 50 } })
    expect(backlog.metadata?.bufferedBytes).toBe(4096)
    expect(performanceSchema.parse({ ...performance, stages: [{ ...performance.stages[0], stage: 'answer.complete' }] }).stages[0].stage).toBe('answer.complete')
    expect(traceDetailSchema.parse(trace).events.some(row => row.stage === 'answer.complete')).toBe(true)
    for (const thresholds of [{ minSamples: 19 }, { minSamples: 10001 }, { sustainSeconds: 299 }, { errorRate: 0 }]) {
      expect(settingsSchema.safeParse({ ...settings, thresholds: { ...settings.thresholds, ...thresholds } }).success).toBe(false)
    }
  })
  it('displays cohort order success and explicit sample rates without synthesizing client coverage', async () => {
    const data = { ...overview, performance: { ...overview.performance, errorRate: 0.1, degradedRate: 0.25, retrievalCount: 40, retrievalSource: 'desktop', tokenCoverage: 0.75, llmSamples: 20, tokenSource: 'desktop', errorRateSamples: 20, errorRateDenominator: 'canonical_attempts_excluding_cancelled_skipped_rejected' } }
    vi.stubGlobal('fetch', vi.fn(async () => response(data)))
    render(<OperationsPage api={new ApiClient('token')} />)
    await screen.findByRole('region', { name: '业务概览' })
    expect(screen.getByText('66.7%')).toBeTruthy()
    expect(screen.getByText('10.0%')).toBeTruthy()
    expect(screen.getByText('25.0%')).toBeTruthy()
    expect(screen.getByText('75.0%')).toBeTruthy()
    expect(screen.getByText(/40 次检索请求/)).toBeTruthy()
    expect(screen.getByText(/20 个同来源 LLM 样本/)).toBeTruthy()
    expect(screen.getByText(/原始事件数不等于用户覆盖率/)).toBeTruthy()
    expect(orderSuccess(0, 0)).toBe('无订单')
    expect(orderSuccess(null, 10)).toBe('未知')
    expect(percentage(undefined)).toBe('未知')
  })
  it('ranks slow stages independently by source and never sums parallel retrievals', async () => {
    const stages = [performance.stages[1], { ...performance.stages[0], stage: 'retrieval.rag', p95Ms: 100 }, performance.stages[0], { ...performance.stages[1], stage: 'llm.complete', p95Ms: 2000 }]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.includes('/performance') ? { ...performance, stages } : overview)))
    const actor = userEvent.setup()
    render(<OperationsPage api={new ApiClient('token')} />)
    await actor.click(screen.getByRole('button', { name: '性能' }))
    const table = await screen.findByRole('table', { name: '慢阶段排行 · 各来源内按 P95 降序' })
    expect(within(table).getAllByRole('rowheader').map(row => row.textContent)).toEqual(['首段正文', '知识库检索', '模型回答完成', '联网检索'])
    expect(screen.getByText(/阶段耗时不能直接相加/)).toBeTruthy()
  })
  it('accepts final empty timing source, mixed retrieval source and separate terminal classifications', async () => {
    const payload = { ...overview, performance: { ...overview.performance, errors: 2, timeouts: 3, rejections: 4, firstContentSource: 'unknown', retrievalSource: 'mixed', errorRate: null, errorRateSamples: 0, errorRateDenominator: 'canonical_attempts_excluding_cancelled_skipped_rejected' } }
    expect(overviewSchema.parse(payload).performance.retrievalSource).toBe('mixed')
    expect(performanceSchema.parse({ ...performance, firstContentSource: 'unknown' }).firstContentSource).toBe('unknown')
    vi.stubGlobal('fetch', vi.fn(async () => response(payload)))
    render(<OperationsPage api={new ApiClient('token')} />)
    await screen.findByRole('region', { name: '体验概览' })
    expect(screen.getByText('系统错误')).toBeTruthy()
    expect(screen.getByText('超时')).toBeTruthy()
    expect(screen.getByText('并发拒绝')).toBeTruthy()
    expect(screen.getByText(/混合来源（各检索阶段选择客户端或后端）/)).toBeTruthy()
    expect(screen.getByText(/排除取消、跳过、拒绝/)).toBeTruthy()
  })
  it('crosslinks old usage by user without fabricating an operation ID', async () => {
    const open = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => response(page([{ id: '1', userId: '7', displayName: '示例用户', requestId: 'request-is-not-an-operation', capability: 'llm', model: 'model', status: 'complete', createdAt: overview.updatedAt, finishedAt: overview.updatedAt }]))))
    const actor = userEvent.setup()
    render(<UsagePage api={new ApiClient('token')} onOpenTrace={open} />)
    await actor.click(await screen.findByRole('button', { name: '查看详情' }))
    await actor.click(screen.getByRole('button', { name: '查看该用户操作' }))
    expect(open).toHaveBeenCalledWith({ userId: '7', operationId: undefined })
    expect(screen.getByText(/旧调用记录未关联操作链路/)).toBeTruthy()
  })
})
