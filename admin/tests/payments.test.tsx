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
const order = { id: 'order-test', paymentMethod: 'wechat' as const, userId: 4, displayName: 'test@example.com', packageName: item.name, durationSeconds: 3600, totalCents: 800, status: 'paid', credited: true, codeUrl: null, createdAt: '2026-09-12T00:00:00Z', expiresAt: '2026-09-12T00:15:00Z', paidAt: '2026-09-12T00:01:00Z', refundedCents: 0, deductedSeconds: 0 }
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
  it('updates an existing package with only writable fields and the latest version', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') {
        const body = data(options); writes.push(body)
        return response({ ...item, ...body, version: item.version + writes.length, priceCents: 1 })
      }
      return response([item])
    }))
    const actor = userEvent.setup()
    render(<PackagesPage api={new ApiClient('token')} />)
    const price = await screen.findByLabelText('原价（元）')
    await actor.clear(price); await actor.type(price, '0.1')
    const discount = screen.getByLabelText('折扣（折，10 为原价）')
    await actor.clear(discount); await actor.type(discount, '1')
    await actor.click(screen.getByRole('button', { name: '保存套餐' }))
    await screen.findByRole('status')
    expect(writes[0]).toEqual({ version: 1, name: item.name, description: '', durationSeconds: 3600,
      originalPriceCents: 10, discountBps: 1000, sortOrder: 0, enabled: true })
    await actor.click(screen.getByRole('button', { name: '保存套餐' }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1]).toEqual({ ...writes[0], version: 2 })
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

const alipayConfig = { version: 1, enabled: false, configured: false, appId: '', sellerId: '', gatewayUrl: 'https://openapi.alipay.com/gateway.do', notifyUrl: '', returnUrl: '', hasAppPrivateKey: false, hasAlipayPublicKey: false }
describe('Alipay management', () => {
  it('saves Alipay independently with an explicit gateway and clears its secrets', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (!url.endsWith('/alipay')) return response(config)
      if (options.method === 'PUT') { writes.push(data(options)); return response({ ...alipayConfig, version: 2, hasAppPrivateKey: true }) }
      return response(alipayConfig)
    }))
    const actor = userEvent.setup()
    render(<PaymentConfigPage api={new ApiClient('token')} />)
    await actor.click(screen.getByRole('button', { name: '支付宝支付' }))
    await actor.type(await screen.findByLabelText('支付宝 AppID'), 'app-test')
    await actor.type(screen.getByLabelText('应用私钥（PKCS#8）'), 'private-test')
    await actor.selectOptions(screen.getByLabelText('支付环境'), 'https://openapi-sandbox.dl.alipaydev.com/gateway.do')
    expect(screen.getByText(/沙箱环境仅用于测试/)).toBeTruthy()
    await actor.click(screen.getByRole('button', { name: '保存支付宝设置' }))
    await screen.findByText('支付宝设置已保存。')
    expect(writes[0]).toMatchObject({ appId: 'app-test', appPrivateKey: 'private-test', gatewayUrl: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do', enabled: false })
    expect(writes[0]).not.toHaveProperty('mchId')
    expect((await screen.findByLabelText('应用私钥（PKCS#8）') as HTMLTextAreaElement).value).toBe('')
  })
  it('discards unsaved secrets when switching payment channels', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/alipay') ? alipayConfig : config)))
    const actor = userEvent.setup()
    render(<PaymentConfigPage api={new ApiClient('token')} />)
    await actor.type(await screen.findByLabelText('API v3 密钥'), 'wechat-draft')
    await actor.click(screen.getByRole('button', { name: '支付宝支付' }))
    await actor.type(await screen.findByLabelText('应用私钥（PKCS#8）'), 'alipay-draft')
    await actor.click(screen.getByRole('button', { name: '微信支付' }))
    expect((await screen.findByLabelText('API v3 密钥') as HTMLInputElement).value).toBe('')
    await actor.click(screen.getByRole('button', { name: '支付宝支付' }))
    expect((await screen.findByLabelText('应用私钥（PKCS#8）') as HTMLTextAreaElement).value).toBe('')
  })
  it('identifies Alipay orders and requires confirmation of the matching external refund', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([{ ...order, paymentMethod: 'alipay' }])))
    const actor = userEvent.setup()
    render(<PaymentOrdersPage api={new ApiClient('token')} />)
    expect(await screen.findByText('支付宝支付')).toBeTruthy()
    await actor.click(screen.getByRole('button', { name: '登记人工退款' }))
    expect(screen.getByText(/本操作不会调用支付宝退款/)).toBeTruthy()
    expect(screen.getByLabelText('支付宝退款单号／凭证')).toBeTruthy()
    expect(screen.getByLabelText('我已在支付宝商户平台完成实际退款')).toBeTruthy()
    expect(screen.queryByLabelText('我已在微信商户平台完成实际退款')).toBeNull()
  })
})


it('selects the production gateway explicitly for an empty Alipay configuration', async () => {
  const writes: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (!url.endsWith('/alipay')) return response(config)
    if (options.method === 'PUT') { writes.push(data(options)); return response({ ...alipayConfig, version: 2 }) }
    return response({ ...alipayConfig, gatewayUrl: '' })
  }))
  const actor = userEvent.setup()
  render(<PaymentConfigPage api={new ApiClient('token')} />)
  await actor.click(screen.getByRole('button', { name: '支付宝支付' }))
  await actor.type(await screen.findByLabelText('支付宝 AppID'), 'new-app')
  expect((screen.getByLabelText('支付环境') as HTMLSelectElement).value).toBe('https://openapi.alipay.com/gateway.do')
  await actor.click(screen.getByRole('button', { name: '保存支付宝设置' }))
  await screen.findByText('支付宝设置已保存。')
  expect(writes[0]).toMatchObject({ appId: 'new-app', gatewayUrl: 'https://openapi.alipay.com/gateway.do' })
})

const zpayConfig = { version: 3, enabled: false, configured: false, pid: '', paymentType: 'alipay', gatewayUrl: '', queryUrl: '', notifyUrl: '', returnUrl: '', cid: '', hasMerchantKey: false }
describe('ZPAY management', () => {
  it('saves independent versioned ZPAY configuration and clears the secret on channel switch', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (!url.endsWith('/zpay')) return response(config)
      if (options.method === 'PUT') { writes.push(data(options)); return response({ ...zpayConfig, version: 4, hasMerchantKey: true }) }
      return response(zpayConfig)
    }))
    const actor = userEvent.setup()
    render(<PaymentConfigPage api={new ApiClient('token')} />)
    await actor.click(screen.getByRole('button', { name: 'ZPAY' }))
    await actor.type(await screen.findByLabelText('ZPAY 商户 ID（PID）'), '12345')
    await actor.selectOptions(screen.getByLabelText('ZPAY 收款方式'), 'wxpay')
    await actor.type(screen.getByLabelText('ZPAY 商户密钥'), 'test-secret')
    await actor.click(screen.getByRole('button', { name: '保存 ZPAY 设置' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({ version: 3, enabled: false, pid: '12345', paymentType: 'wxpay', merchantKey: 'test-secret', gatewayUrl: 'https://zpayz.cn/mapi.php', queryUrl: 'https://zpayz.cn/api.php', notifyUrl: 'https://api.junshi.icu/api/v1/payments/zpay/notify', returnUrl: 'https://junshi.icu/payment/result', cid: '' })
    await screen.findByText('ZPAY 设置已保存。')
    await actor.click(screen.getByRole('button', { name: '微信支付' }))
    await actor.click(screen.getByRole('button', { name: 'ZPAY' }))
    expect((await screen.findByLabelText('ZPAY 商户密钥') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: '测试连接' })).toBeNull()
  })
  it('identifies ZPAY orders and supports filtering by channel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([{ ...order, paymentMethod: 'zpay' }])))
    render(<PaymentOrdersPage api={new ApiClient('token')} />)
    await screen.findByText('ZPAY支付')
    await userEvent.setup().type(screen.getByLabelText('筛选当前列表'), 'ZPAY')
    expect(screen.getByText('test@example.com')).toBeTruthy()
  })
})
