import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UsagePage, { usageDuration } from '../src/pages/UsagePage'
import AuditPage from '../src/pages/AuditPage'
import { ApiClient } from '../src/api'
import { page, response } from './fixtures'
describe('request and audit records', () => {
  it('applies server filters and shows the empty result', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return response(page([])) }))
    const actor = userEvent.setup(); render(<UsagePage api={new ApiClient('token')} />)
    await screen.findByText('没有匹配的调用记录。')
    await actor.click(screen.getByRole('button', { name: '更多筛选' }))
    await actor.type(screen.getByLabelText('邮箱或显示名称'), 'reader@example.com'); await actor.type(screen.getByLabelText('用户 ID'), '20'); await actor.selectOptions(screen.getByLabelText('服务能力'), 'llm'); await actor.selectOptions(screen.getByLabelText('请求状态'), 'complete'); await actor.type(screen.getByLabelText('模型'), '中文 模型')
    await actor.click(screen.getByRole('button', { name: '筛选记录' }))
    await waitFor(() => expect(calls.some(url => url.includes('userId=20&query=reader%40example.com&capability=llm&status=complete&model=%E4%B8%AD%E6%96%87+%E6%A8%A1%E5%9E%8B&page=1'))).toBe(true))
  })
  it('keeps generic retrieval usage available after removing the remote service', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return response(page([{ id: '2', userId: '20', displayName: '示例用户', requestId: 'retrieval-request', capability: 'knowledge', model: 'tavily-search', status: 'complete', createdAt: '2026-09-08T08:00:00Z', finishedAt: null }])) }))
    const actor = userEvent.setup(); render(<UsagePage api={new ApiClient('token')} />)
    await screen.findByText('tavily-search')
    await actor.selectOptions(screen.getByLabelText('服务能力'), 'knowledge')
    await actor.click(screen.getByRole('button', { name: '筛选记录' }))
    await waitFor(() => expect(calls.some(url => url.includes('capability=knowledge'))).toBe(true))
    expect(screen.getAllByText('资料检索').length).toBeGreaterThan(0)
    expect(screen.queryByText('远程知识库')).toBeNull()
  })
  it('shows an email display name in usage records without a generated username', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(page([{ id: '1', userId: '20', displayName: 'reader@example.com', requestId: 'request-1', capability: 'llm', model: 'model-1', status: 'complete', createdAt: '2026-09-08T08:00:00Z', finishedAt: null }]))))
    render(<UsagePage api={new ApiClient('token')} />)
    expect(await screen.findByRole('rowheader', { name: /reader@example.com/ })).toBeTruthy()
  })
  it('shows an audit fetch error and supports retry without leaving the page', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ message: '暂时无法读取日志' }, 503)).mockResolvedValueOnce(response(page([{ id: '1', actorId: '1', actorDisplayName: 'admin', action: 'user.create', target: 'user:2', createdAt: '2026-09-08T08:00:00Z' }])))
    vi.stubGlobal('fetch', fetchMock)
    const actor = userEvent.setup(); render(<AuditPage api={new ApiClient('token')} />)
    await screen.findByRole('alert'); await actor.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByText('user.create'); expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

it('opens request details and computes elapsed time only from valid completed timestamps', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(page([{ id: '1', userId: '20', displayName: '示例用户', requestId: 'request-example', capability: 'asr', model: 'asr-example', status: 'failed', createdAt: '2026-09-08T08:00:00Z', finishedAt: '2026-09-08T08:00:06.210Z' }]))))
  const actor = userEvent.setup(); render(<UsagePage api={new ApiClient('token')} />)
  await actor.click(await screen.findByRole('button', { name: '查看详情' }))
  expect(screen.getByRole('region', { name: '请求详情' })).toBeTruthy()
  expect(screen.getByText('request-example')).toBeTruthy()
  expect(screen.getAllByText('6.21 秒')).toHaveLength(2)
  await actor.click(screen.getByRole('button', { name: '收起详情' }))
  expect(screen.queryByRole('region', { name: '请求详情' })).toBeNull()
  expect(usageDuration('2026-09-08T08:00:00Z', null)).toBe('—')
  expect(usageDuration('invalid', 'invalid')).toBe('—')
  expect(usageDuration('2026-09-08T08:01:00Z', '2026-09-08T08:00:00Z')).toBe('—')
})

it('filters the current audit page and opens complete operation details', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(page([
    { id: '1', actorId: '1', actorDisplayName: '管理员', action: 'user.create', target: 'user:2', createdAt: '2026-09-08T08:00:00Z' },
    { id: '2', actorId: '3', actorDisplayName: '运营', action: 'payment.package.save', target: '7', createdAt: '2026-09-07T08:00:00Z' },
  ]))))
  const actor = userEvent.setup(); render(<AuditPage api={new ApiClient('token')} />)
  await actor.click(await screen.findByRole('button', { name: '创建用户 user.create' }))
  expect(screen.getByRole('button', { name: '关闭操作详情' })).toBeTruthy()
  expect(screen.getAllByText('user:2')).toHaveLength(2)
  await actor.type(screen.getByLabelText('搜索当前页'), '保存套餐')
  expect(screen.queryByRole('button', { name: '创建用户 user.create' })).toBeNull()
  expect(screen.queryByRole('button', { name: '关闭操作详情' })).toBeNull()
  await actor.selectOptions(screen.getByLabelText('操作者', { exact: true }), '1')
  expect(screen.getByText('当前页没有匹配的操作记录。')).toBeTruthy()
  await actor.click(screen.getByRole('button', { name: '重置' }))
  expect(screen.getByRole('button', { name: '创建用户 user.create' })).toBeTruthy()
})
