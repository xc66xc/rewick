import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import PackagesPage from '../src/pages/PackagesPage'
import PaymentConfigPage from '../src/pages/PaymentConfigPage'
import PaymentOrdersPage from '../src/pages/PaymentOrdersPage'
import PaymentRefundDialog from '../src/components/PaymentRefundDialog'
import { data, response } from './fixtures'

const item = { id: 1, version: 1, name: '标准套餐', description: '', durationSeconds: 3600, originalPriceCents: 1000, discountBps: 8000, priceCents: 800, sortOrder: 0, enabled: true }
const config = { version: 2, enabled: false, configured: false, mchId: '', appId: '', merchantSerial: '', wechatPublicKeyId: '', notifyUrl: '', hasMerchantPrivateKey: false, hasApiV3Key: false, hasWechatPublicKey: false }
const order = { id: 'order-test', userId: 4, displayName: 'test@example.com', packageName: item.name, durationSeconds: 3600, totalCents: 800, status: 'paid', credited: true, codeUrl: null, createdAt: '2026-09-12T00:00:00Z', expiresAt: '2026-09-12T00:15:00Z', paidAt: '2026-09-12T00:01:00Z', refundedCents: 0, deductedSeconds: 0 }
describe('payment management', () => {
  it('saves one package using cents and basis points without submitting its estimated price', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'POST') { writes.push(data(options)); return response({ ...item, ...data(options) }) }
      return response([])
    }))
    const actor = userEvent.setup()
    render(<PackagesPage api={new ApiClient('token')} />)
    await screen.findByText('尚无套餐，请添加。')
    await actor.click(screen.getByRole('button', { name: '添加套餐' }))
    await actor.type(screen.getByLabelText('套餐名称'), '周末套餐')
    await actor.clear(screen.getByLabelText('原价（元）')); await actor.type(screen.getByLabelText('原价（元）'), '20.99')
    await actor.clear(screen.getByLabelText('折扣（折，10 为原价）')); await actor.type(screen.getByLabelText('折扣（折，10 为原价）'), '8')
    await actor.click(screen.getByRole('button', { name: '保存套餐' }))
    await screen.findByRole('status')
    expect(writes[0]).toMatchObject({ name: '周末套餐', originalPriceCents: 2099, discountBps: 8000, durationSeconds: 3600 })
    expect(writes[0]).not.toHaveProperty('priceCents')
  })
  it('preserves other package drafts when one package is saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => options.method === 'PUT' ? response({ ...item, version: 2 }) : response([item, { ...item, id: 2, name: '另一个套餐' }])))
    const actor = userEvent.setup()
    render(<PackagesPage api={new ApiClient('token')} />)
    const fields = await screen.findAllByLabelText('套餐名称')
    await actor.clear(fields[1]); await actor.type(fields[1], '尚未保存的修改')
    await actor.click(screen.getAllByRole('button', { name: '保存套餐' })[0])
    await screen.findByRole('status')
    expect((screen.getAllByLabelText('套餐名称')[1] as HTMLInputElement).value).toBe('尚未保存的修改')
  })
  it('does not echo payment secrets and clears them after saving', async () => {
    let saved = false
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') { saved = true; expect(data(options).apiV3Key).toBe('test-secret'); return response({ ...config, version: 3, hasApiV3Key: true }) }
      return response(saved ? { ...config, version: 3, hasApiV3Key: true } : config)
    }))
    const actor = userEvent.setup()
    render(<PaymentConfigPage api={new ApiClient('token')} />)
    await actor.type(await screen.findByLabelText('API v3 密钥'), 'test-secret')
    await actor.click(screen.getByRole('button', { name: '保存支付设置' }))
    await screen.findByText('支付设置已保存。')
    expect((await screen.findByLabelText(/API v3 密钥/ ) as HTMLInputElement).value).toBe('')
  })
  it('shows user identity and retries fulfillment through a server query', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'POST') { calls.push(url); return response(order) }
      return response([{ ...order, credited: false }])
    }))
    const actor = userEvent.setup()
    render(<PaymentOrdersPage api={new ApiClient('token')} />)
    const table = await screen.findByRole('table', { name: '支付订单列表' })
    expect(within(table).getByText('test@example.com')).toBeTruthy()
    await actor.click(within(table).getByRole('button', { name: '重试时长到账' }))
    await screen.findByRole('status')
    expect(calls).toEqual(['/api/v1/admin/payment-orders/order-test/refresh'])
  })
  it('requires external refund confirmation and reuses the operation id on uncertain retry', async () => {
    const attempts: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { attempts.push(data(options)); return attempts.length === 1 ? response({ message: '结果暂未确认' }, 503) : response(order) }))
    const actor = userEvent.setup(), saved = vi.fn()
    render(<PaymentRefundDialog api={new ApiClient('token')} order={order} onSaved={saved} onClose={vi.fn()} />)
    expect((screen.getByRole('button', { name: '登记退款并扣回时长' }) as HTMLButtonElement).disabled).toBe(true)
    await actor.type(screen.getByLabelText('微信退款单号／凭证'), 'refund-123')
    await actor.type(screen.getByLabelText('退款原因'), '用户申请')
    await actor.click(screen.getByLabelText('我已在微信商户平台完成实际退款'))
    await actor.click(screen.getByRole('button', { name: '登记退款并扣回时长' }))
    await screen.findByText('结果暂未确认')
    await actor.click(screen.getByRole('button', { name: '登记退款并扣回时长' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(attempts[0]).toEqual(attempts[1])
    expect(attempts[0]).toMatchObject({ refundCents: 800, deductSeconds: 3600, reference: 'refund-123', reason: '用户申请' })
  })
})
