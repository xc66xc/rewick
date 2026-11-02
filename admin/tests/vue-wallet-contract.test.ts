import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import WalletEditor from '../src/components/business-rewick/WalletEditor.vue'
import PaymentRefundDialog from '../src/components/business-rewick/PaymentRefundDialog.vue'
import PackageEditor from '../src/components/business-rewick/PackageEditor.vue'
import UserEditor from '../src/components/business-rewick/UserEditor.vue'
import { data, response, user } from './fixtures'

const wallet = { availableSeconds: 3600, version: 4, serverTime: '2026-09-11T00:00:00Z', session: null }
const order = { id: 'order-synthetic', paymentMethod: 'wechat' as const, userId: 2, displayName: 'fixture-user', packageName: '标准练习', durationSeconds: 3600, totalCents: 800, status: 'paid', credited: true, codeUrl: null, createdAt: '2026-09-12T00:00:00Z', expiresAt: '2026-09-12T00:15:00Z', paidAt: '2026-09-12T00:01:00Z', refundedCents: 0, deductedSeconds: 0 }
async function setNumber(label: string, value: string) { const actor = userEvent.setup(); const field = await screen.findByLabelText(label, { exact: true }); await actor.clear(field); await actor.type(field, value) }
async function selectOption(label: string) { await userEvent.setup().click(await screen.findByRole('combobox')); await userEvent.setup().click(await screen.findByRole('option', { name: label })) }

describe('Vue wallet mutation contracts', () => {
  it('preserves seconds/version/body and reuses the idempotency key after an uncertain failure', async () => {
    const attempts: Record<string, unknown>[] = [], paths: string[] = [], saved = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      paths.push(url)
      if (options.method === 'POST') { attempts.push(data(options)); return attempts.length === 1 ? response({ message: '暂时无法确认结果' }, 503) : response({ ...wallet, availableSeconds: 7384, version: 5 }) }
      return response(wallet)
    }))
    render(WalletEditor, { props: { api: new ApiClient('fixture'), user, onSaved: saved } })
    await setNumber('小时', '1'); await setNumber('分钟', '3'); await setNumber('秒', '4')
    const actor = userEvent.setup()
    await actor.type(screen.getByRole('textbox', { name: '调整原因' }), '  验收增加时长  ')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    await screen.findByText('暂时无法确认结果')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(attempts[0]).toEqual(attempts[1])
    expect(attempts[0]).toMatchObject({ operation: 'add', seconds: 3784, expectedVersion: 4, reason: '验收增加时长' })
    expect(attempts[0].requestId).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    expect(paths).toEqual(['/api/v1/admin/users/2/wallet', '/api/v1/admin/users/2/wallet/adjust', '/api/v1/admin/users/2/wallet/adjust'])
  })
  it('blocks overdrawing a wallet before sending a mutation', async () => {
    const fetcher = vi.fn(async () => response(wallet)); vi.stubGlobal('fetch', fetcher)
    render(WalletEditor, { props: { api: new ApiClient('fixture'), user } })
    await selectOption('扣除时长'); await setNumber('小时', '2')
    const actor = userEvent.setup()
    await actor.type(screen.getByRole('textbox', { name: '调整原因' }), '扣除')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    expect((await screen.findByRole('alert')).textContent).toContain('不能小于 0')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('requires explicit reload after a version conflict rather than overwriting another adjustment', async () => {
    let reads = 0, mutations = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'POST') { mutations++; return response({ message: '可用时长已更新，请重新加载。' }, 409) }
      reads++; return response({ ...wallet, availableSeconds: reads === 1 ? 3600 : 1800, version: reads === 1 ? 4 : 5 })
    }))
    render(WalletEditor, { props: { api: new ApiClient('fixture'), user } })
    await selectOption('设定剩余时长')
    const actor = userEvent.setup()
    await actor.type(screen.getByRole('textbox', { name: '调整原因' }), '停止验收')
    await actor.click(screen.getByRole('button', { name: '保存时长' }))
    await actor.click(await screen.findByRole('button', { name: '重新加载当前时长' }))
    await screen.findAllByText(/0 小时 30 分 0 秒/)
    expect(reads).toBe(2); expect(mutations).toBe(1)
  })
  it('uses only the independent simulation-wallet endpoint and a signed delta', async () => {
    const requests: { url: string; body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      requests.push({ url, body: options.body ? data(options) : null })
      return response({ availableSeconds: options.method === 'POST' ? 3540 : 3600, version: 1 })
    }))
    const saved = vi.fn(); render(WalletEditor, { props: { api: new ApiClient('fixture'), user, mock: true, onSaved: saved } })
    await selectOption('扣除模拟时长'); await setNumber('分钟', '1')
    const actor = userEvent.setup()
    await actor.type(screen.getByRole('textbox', { name: '调整原因' }), '模拟余额扣回')
    await actor.click(screen.getByRole('button', { name: '保存模拟时长' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(requests.map(row => row.url)).toEqual(['/api/v1/admin/users/2/mock-wallet', '/api/v1/admin/users/2/mock-wallet/adjustments'])
    expect(requests[1].body).toMatchObject({ deltaSeconds: -60, reason: '模拟余额扣回' })
    expect(Object.keys(requests[1].body as object).sort()).toEqual(['deltaSeconds', 'reason', 'requestId'])
  })
})

describe('Vue payment and account mutation contracts', () => {
  it('registers a manual refund with the exact body and preserves its request ID on retry', async () => {
    const attempts: Record<string, unknown>[] = [], saved = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe('/api/v1/admin/payment-orders/order-synthetic/refund')
      attempts.push(data(options))
      return attempts.length === 1 ? response({ message: '登记结果未知，请重试' }, 503) : response(order)
    }))
    render(PaymentRefundDialog, { props: { api: new ApiClient('fixture'), order, onSaved: saved } })
    const actor = userEvent.setup()
    await actor.type(screen.getByRole('textbox', { name: '微信退款单号／凭证' }), '  synthetic-refund  ')
    await actor.type(screen.getByRole('textbox', { name: '退款原因' }), '  已线下退款  ')
    await actor.click(screen.getByRole('checkbox', { name: '我已在微信商户平台完成实际退款' }))
    await actor.click(screen.getByRole('button', { name: '登记退款并扣回时长' }))
    await screen.findByText('登记结果未知，请重试')
    await actor.click(screen.getByRole('button', { name: '登记退款并扣回时长' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1])
    expect(attempts[0]).toMatchObject({ refundCents: 800, deductSeconds: 3600, reference: 'synthetic-refund', reason: '已线下退款' })
    expect(Object.keys(attempts[0]).sort()).toEqual(['deductSeconds', 'reason', 'reference', 'refundCents', 'requestId'])
  })
  it('does not send a refund without explicit confirmation', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    render(PaymentRefundDialog, { props: { api: new ApiClient('fixture'), order } })
    expect(screen.getByRole('button', { name: '登记退款并扣回时长' })).toHaveProperty('disabled', true)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('saves package cents and basis points without publishing an estimated price', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe('/api/v1/admin/packages'); expect(options.method).toBe('POST')
      const body = data(options); writes.push(body)
      return response({ ...body, id: 1, version: 1, priceCents: 800 })
    }))
    const saved = vi.fn(); render(PackageEditor, { props: { api: new ApiClient('fixture'), onSaved: saved } })
    const actor = userEvent.setup()
    await actor.type(screen.getByRole('textbox', { name: '套餐名称' }), '标准练习')
    await setNumber('原价（元）', '10'); await setNumber('折扣（折，10 为原价）', '8')
    await actor.click(screen.getByRole('button', { name: '保存套餐' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(writes).toEqual([{ name: '标准练习', description: '', durationSeconds: 3600, originalPriceCents: 1000, discountBps: 8000, sortOrder: 0, enabled: false }])
  })
  it('creates a zero-balance user with the old body and clears the submitted password after failure', async () => {
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe('/api/v1/admin/users'); writes.push(data(options)); return response({ message: '用户创建失败' }, 409)
    }))
    render(UserEditor, { props: { api: new ApiClient('fixture') } })
    const actor = userEvent.setup()
    await actor.type(screen.getByRole('textbox', { name: '登录账号' }), '  candidate-test  ')
    await actor.type(screen.getByLabelText(/^初始密码/), 'synthetic-password')
    await actor.click(screen.getByRole('button', { name: '创建用户' }))
    await screen.findByText('用户创建失败')
    expect(writes).toEqual([{ identifier: 'candidate-test', password: 'synthetic-password', availableSeconds: 0 }])
    expect(screen.getByLabelText(/^初始密码/)).toHaveProperty('value', '')
  })
})
