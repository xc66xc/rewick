import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UsagePage from '../src/pages/UsagePage'
import AuditPage from '../src/pages/AuditPage'
import { ApiClient } from '../src/api'
import { page, response } from './fixtures'
describe('request and audit records', () => {
  it('applies server filters and shows the empty result', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return response(page([])) }))
    const actor = userEvent.setup(); render(<UsagePage api={new ApiClient('token')} />)
    await screen.findByText('没有匹配的调用记录。')
    await actor.type(screen.getByLabelText('用户 ID'), '20'); await actor.selectOptions(screen.getByLabelText('服务能力'), 'llm'); await actor.selectOptions(screen.getByLabelText('请求状态'), 'complete'); await actor.type(screen.getByLabelText('模型'), '中文 模型')
    await actor.click(screen.getByRole('button', { name: '筛选记录' }))
    await waitFor(() => expect(calls.some(url => url.includes('userId=20&capability=llm&status=complete&model=%E4%B8%AD%E6%96%87+%E6%A8%A1%E5%9E%8B&page=1'))).toBe(true))
  })
  it('shows an audit fetch error and supports retry without leaving the page', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ message: '暂时无法读取日志' }, 503)).mockResolvedValueOnce(response(page([{ id: '1', actorId: '1', actorUsername: 'admin', action: 'user.create', target: 'user:2', createdAt: '2026-09-08T08:00:00Z' }])))
    vi.stubGlobal('fetch', fetchMock)
    const actor = userEvent.setup(); render(<AuditPage api={new ApiClient('token')} />)
    await screen.findByRole('alert'); await actor.click(screen.getByRole('button', { name: '重新加载' }))
    await screen.findByText('user.create'); expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
