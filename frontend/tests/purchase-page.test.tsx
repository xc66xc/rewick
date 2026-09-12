// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopBridge } from '../src/shared/types'
import type { CreatePaymentOrder, PaymentMethod, PaymentOrder } from '../src/shared/payment'
import PurchasePage from '../src/renderer/src/components/payment/PurchasePage'
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,test') } }))
vi.mock('../src/renderer/src/components/ui/toast', () => ({ toast: { show: vi.fn() } }))
const item = { id: 1, version: 2, name: '面试两小时', description: '适合两场面试', durationSeconds: 7200, originalPriceCents: 2000, discountBps: 8000, priceCents: 1600, sortOrder: 1, enabled: true }
const order: PaymentOrder = { id: 'order-1', paymentMethod: 'wechat', userId: 1, displayName: 'a@example.com', packageName: item.name, durationSeconds: 7200, totalCents: 1600, status: 'pending', credited: false, codeUrl: 'weixin://test', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 900000).toISOString(), paidAt: null, refundedCents: 0, deductedSeconds: 0 }
function setup(available = true, orders: PaymentOrder[] = [], methods: PaymentMethod[] = ['wechat']) {
  const api = { getPackageCatalog: vi.fn(async () => ({ paymentAvailable: available, paymentMethods: available ? methods : [], packages: [item] })), getPaymentOrders: vi.fn(async () => orders), createPaymentOrder: vi.fn(async (input: CreatePaymentOrder) => ({ ...order, paymentMethod: input.paymentMethod })), refreshPaymentOrder: vi.fn(async () => ({ ...order, status: 'paid' as const, credited: true })), startInterview: vi.fn(), endInterview: vi.fn() }
  const onCredited = vi.fn(async () => undefined)
  const view = render(<PurchasePage bridge={api as unknown as DesktopBridge} scope="account-1" remaining={100} onCredited={onCredited} />)
  return { ...view, api, onCredited }
}
afterEach(() => { cleanup(); sessionStorage.clear() })
describe('PurchasePage', () => {
  it('shows packages but prevents purchases when payment is unconfigured', async () => {
    const { api } = setup(false)
    await screen.findByText('支付暂未开放')
    expect((screen.getByRole('button', { name: '购买 面试两小时' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.createPaymentOrder).not.toHaveBeenCalled()
  })
  it('shows QR for server-priced order; closing preserves the order', async () => {
    const { api } = setup()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '购买 面试两小时' }))
    await screen.findByRole('img', { name: '使用手机微信扫描此二维码支付' })
    expect(api.createPaymentOrder).toHaveBeenCalledWith({ packageId: 1, packageVersion: 2, paymentMethod: 'wechat', requestId: expect.any(String) })
    await user.click(screen.getAllByRole('button', { name: '关闭' })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: '查看订单' })).toBeTruthy()
    expect(api.startInterview).not.toHaveBeenCalled(); expect(api.endInterview).not.toHaveBeenCalled()
  })
  it('reuses request id after network failure', async () => {
    const { api } = setup(); api.createPaymentOrder.mockRejectedValueOnce(new Error('网络中断'))
    const user = userEvent.setup(); const button = await screen.findByRole('button', { name: '购买 面试两小时' })
    await user.click(button); await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); await user.click(button)
    expect(api.createPaymentOrder.mock.calls[0]).toEqual(api.createPaymentOrder.mock.calls[1])
  })
  it('refreshes balance once after server confirms credit without starting interview', async () => {
    const { api, onCredited } = setup(true, [order]); const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '查看订单' })); await user.click(screen.getByRole('button', { name: '查看支付结果' }))
    await waitFor(() => expect(onCredited).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: '查看支付结果' }))
    expect(onCredited).toHaveBeenCalledTimes(1); expect(api.startInterview).not.toHaveBeenCalled()
  })
  it('discards an in-flight payment result after leaving the account page', async () => {
    const { api, onCredited, unmount } = setup(true, [order])
    let resolve: ((value: typeof order & { status: 'paid'; credited: boolean }) => void) | undefined
    api.refreshPaymentOrder.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '查看订单' }))
    await user.click(screen.getByRole('button', { name: '查看支付结果' }))
    unmount()
    resolve?.({ ...order, status: 'paid', credited: true })
    await Promise.resolve()
    expect(onCredited).not.toHaveBeenCalled()
  })

  it('refreshes wallet when an order was paid after its modal was closed', async () => {
    const { api, onCredited } = setup(true, [order])
    const user = userEvent.setup()
    await screen.findByRole('button', { name: '查看订单' })
    api.getPaymentOrders.mockResolvedValueOnce([{ ...order, status: 'paid', credited: true }])
    await user.click(screen.getByRole('button', { name: '刷新套餐与订单' }))
    await waitFor(() => expect(onCredited).toHaveBeenCalledTimes(1))
  })

  it('offers both methods and uses Alipay consistently after selection and reopening', async () => {
    const { api } = setup(true, [], ['wechat', 'alipay'])
    const user = userEvent.setup()
    await screen.findByRole('button', { name: '微信支付' })
    expect(screen.getByRole('button', { name: '微信支付' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: '支付宝支付' }))
    await user.click(screen.getByRole('button', { name: '购买 面试两小时' }))
    await screen.findByRole('img', { name: '使用手机支付宝扫描此二维码支付' })
    expect(api.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'alipay' }))
    expect(screen.getByRole('dialog').textContent).toContain('支付宝扫码购买时长')
    await user.click(screen.getAllByRole('button', { name: '关闭' })[0])
    await user.click(screen.getByRole('button', { name: '微信支付' }))
    await user.click(screen.getByRole('button', { name: '查看订单' }))
    await screen.findByRole('img', { name: '使用手机支付宝扫描此二维码支付' })
    expect(api.createPaymentOrder).toHaveBeenCalledTimes(1)
  })

  it('defaults to Alipay when it is the sole enabled payment method', async () => {
    const { api } = setup(true, [], ['alipay'])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '购买 面试两小时' }))
    expect(api.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'alipay' }))
    expect(screen.queryByRole('button', { name: '微信支付' })).toBeNull()
  })

  it('requires explicit reselection when the selected method becomes unavailable', async () => {
    const { api } = setup(true, [], ['wechat', 'alipay'])
    const user = userEvent.setup()
    await screen.findByRole('button', { name: '微信支付' })
    api.getPackageCatalog.mockResolvedValueOnce({ paymentAvailable: true, paymentMethods: ['alipay'], packages: [item] })
    await user.click(screen.getByRole('button', { name: '刷新套餐与订单' }))
    await screen.findByText('原支付方式已不可用，请重新选择。')
    expect((screen.getByRole('button', { name: '购买 面试两小时' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: '支付宝支付' }))
    await user.click(screen.getByRole('button', { name: '购买 面试两小时' }))
    expect(api.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'alipay' }))
  })

  it('retains a separate retry identity for each payment method', async () => {
    const { api } = setup(true, [], ['wechat', 'alipay'])
    api.createPaymentOrder.mockRejectedValue(new Error('网络中断'))
    const user = userEvent.setup()
    const buy = await screen.findByRole('button', { name: '购买 面试两小时' })
    await user.click(buy)
    await waitFor(() => expect((buy as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: '支付宝支付' }))
    await user.click(buy)
    await waitFor(() => expect((buy as HTMLButtonElement).disabled).toBe(false))
    await user.click(screen.getByRole('button', { name: '微信支付' }))
    await user.click(buy)
    const inputs = api.createPaymentOrder.mock.calls.map(call => call[0])
    expect(inputs[0]).toEqual(inputs[2])
    expect(inputs[0].requestId).not.toBe(inputs[1].requestId)
    expect(inputs[1].paymentMethod).toBe('alipay')
  })

})
