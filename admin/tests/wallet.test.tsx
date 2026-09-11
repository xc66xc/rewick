import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import WalletEditor from '../src/components/WalletEditor'
import WalletHistory from '../src/components/WalletHistory'
import { data, page, response, user } from './fixtures'

const wallet = { availableSeconds: 3600, version: 4, serverTime: '2026-09-11T00:00:00Z', session: null }
describe('available interview duration', () => {
  it('converts hours/minutes/seconds and reuses the request ID after an uncertain failure', async () => {
    const attempts: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'POST') { attempts.push(data(options)); return attempts.length === 1 ? response({ message: '暂时无法确认结果' }, 503) : response({ ...wallet, availableSeconds: 7384, version: 5 }) }
      return response(wallet)
    }))
    const saved = vi.fn()
    const actor = userEvent.setup()
    render(<WalletEditor api={new ApiClient('token')} user={user} onSaved={saved} onClose={vi.fn()} />)
    await actor.clear(await screen.findByLabelText('小时')); await actor.type(screen.getByLabelText('小时'), '1')
    await actor.clear(screen.getByLabelText('分钟')); await actor.type(screen.getByLabelText('分钟'), '3')
    await actor.clear(screen.getByLabelText('秒')); await actor.type(screen.getByLabelText('秒'), '4')
    await actor.type(screen.getByLabelText('调整原因'), '开发验收增加时长')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    await screen.findByText('暂时无法确认结果')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toEqual(attempts[1])
    expect(attempts[1]).toMatchObject({ operation: 'add', seconds: 3784, expectedVersion: 4, reason: '开发验收增加时长' })
    expect(attempts[0].requestId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  })
  it('blocks subtracting more than the available balance', async () => {
    const fetcher = vi.fn(async () => response(wallet)); vi.stubGlobal('fetch', fetcher)
    const actor = userEvent.setup()
    render(<WalletEditor api={new ApiClient('token')} user={user} onSaved={vi.fn()} onClose={vi.fn()} />)
    await actor.selectOptions(await screen.findByLabelText('调整方式'), 'subtract')
    await actor.clear(screen.getByLabelText('小时')); await actor.type(screen.getByLabelText('小时'), '2')
    await actor.type(screen.getByLabelText('调整原因'), '扣除')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    expect((await screen.findByRole('alert')).textContent).toContain('不能小于 0')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('requires reloading after a concurrent change instead of overwriting the balance', async () => {
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => options.method === 'POST'
      ? response({ message: '可用时长已更新，请重新加载。' }, 409)
      : response({ ...wallet, availableSeconds: ++reads === 1 ? 3600 : 1800, version: reads === 1 ? 4 : 5 })))
    const actor = userEvent.setup()
    render(<WalletEditor api={new ApiClient('token')} user={user} onSaved={vi.fn()} onClose={vi.fn()} />)
    await actor.selectOptions(await screen.findByLabelText('调整方式'), 'set')
    await actor.type(screen.getByLabelText('调整原因'), '停止测试')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    await actor.click(await screen.findByRole('button', { name: '重新加载当前时长' }))
    await screen.findAllByText('0 小时 30 分 0 秒')
    expect(reads).toBe(2)
  })
  it('shows signed changes and operator names in duration history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(page([{ id: '1', deltaSeconds: -60, beforeSeconds: 3600, afterSeconds: 3540, reason: '面试计时', actorDisplayName: null, sessionId: 'test-session', createdAt: '2026-09-11T00:00:00Z' }]))))
    render(<WalletHistory api={new ApiClient('token')} user={user} onClose={vi.fn()} />)
    const table = await screen.findByRole('table', { name: '时长变动记录' })
    expect(within(table).getByText('−0 小时 1 分 0 秒')).toBeTruthy()
    expect(within(table).getByText('系统计时 · 面试 test-session')).toBeTruthy()
  })
})
