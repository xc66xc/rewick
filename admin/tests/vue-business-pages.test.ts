import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import UsersPage from '../src/views/business/UsersPage.vue'
import InvitationsPage from '../src/views/business/InvitationsPage.vue'
import PackagesPage from '../src/views/business/PackagesPage.vue'
import PaymentOrdersPage from '../src/views/business/PaymentOrdersPage.vue'
import { data, page, response, user } from './fixtures'
// jsdom does not implement viewport hit testing; actual drawer morphs are covered in Chromium.
Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
const item = { id: 1, version: 2, name: '标准套餐', description: '', durationSeconds: 3600, originalPriceCents: 1000, discountBps: 8000, priceCents: 800, sortOrder: 0, enabled: true }
const order = { id: 'order-fixture', paymentMethod: 'wechat', userId: 2, displayName: '测试用户', packageName: '标准套餐', durationSeconds: 3600, totalCents: 800, status: 'paid', credited: true, codeUrl: null, createdAt: '2026-11-03T10:00:00+08:00', expiresAt: '2026-11-03T10:15:00+08:00', paidAt: '2026-11-03T10:01:00+08:00', refundedCents: 0, deductedSeconds: 0 }
describe('Vue business page migration', () => {
 it('preserves server search/pagination and dismisses the user action menu with focus restoration', async () => {
  const paths: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { paths.push(url); if (url.endsWith('/mock-wallet')) return response({ availableSeconds: 600, version: 1 }); return response(page([user], 21, url.includes('page=2') ? 2 : 1)) }))
  const actor = userEvent.setup(); render(UsersPage, { props: { api: new ApiClient('fixture') } })
  const more = await screen.findByRole('button', { name: '更多操作 candidate' }); await actor.click(more)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '时长记录 candidate' })))
  await actor.keyboard('{Escape}'); expect(screen.queryByRole('button', { name: '时长记录 candidate' })).toBeNull(); expect(document.activeElement).toBe(more)
  await actor.click(screen.getByRole('button', { name: '下一页' })); await waitFor(() => expect(paths.some(path => path.includes('page=2'))).toBe(true))
  await actor.type(screen.getByRole('textbox', { name: '邮箱或显示名称' }), 'candidate'); await actor.click(screen.getByRole('button', { name: '搜索' })); await waitFor(() => expect(paths.some(path => path.includes('query=candidate&page=1&size=20'))).toBe(true))
 })
 it('preserves the package toggle payload including version and excludes server-computed price', async () => {
  const writes: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { if (options.method === 'PUT') { writes.push(data(options)); return response({ ...item, enabled: false, version: 3 }) }; return response([item]) }))
  render(PackagesPage, { props: { api: new ApiClient('fixture') } }); const actor = userEvent.setup()
  await actor.click(await screen.findByRole('button', { name: '下架 标准套餐' })); expect(writes).toHaveLength(0)
  await actor.click(screen.getByRole('button', { name: '确认下架' })); await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ version: 2, name: item.name, description: '', durationSeconds: 3600, originalPriceCents: 1000, discountBps: 8000, sortOrder: 0, enabled: false })
 })
 it('retains invitation draft after version conflict and preserves the versioned request', async () => {
  const writes: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => { if (options.method === 'PUT') { writes.push(data(options)); return response({ message: '规则已更新' }, 409) }; return response(url.includes('/invitation-settings') ? { enabled: false, rewardSeconds: 600, version: 4 } : page([])) }))
  render(InvitationsPage, { props: { api: new ApiClient('fixture') } }); const actor = userEvent.setup()
  await actor.click(await screen.findByRole('button', { name: '修改规则' })); await actor.click(screen.getByRole('switch', { name: '启用邀请奖励' })); await actor.click(screen.getByRole('button', { name: '保存奖励配置' }))
  await screen.findByText('规则已更新'); expect(screen.getByRole('switch', { name: '启用邀请奖励' })).toHaveProperty('checked', true); expect(writes[0]).toEqual({ enabled: true, rewardSeconds: 600, version: 4 })
 })
 it('combines payment status/channel filters locally and clears the selected order', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { requests.push(url); return response([order, { ...order, id: 'pending-order', displayName: '待支付用户', status: 'pending', credited: false, paymentMethod: 'alipay' }]) }))
  render(PaymentOrdersPage, { props: { api: new ApiClient('fixture') } }); const actor = userEvent.setup()
  await actor.click((await screen.findAllByRole('button', { name: '查看详情' }))[0]); expect(screen.getByRole('dialog', { name: '订单详情' })).toBeTruthy()
  await actor.click(screen.getByRole('radio', { name: '待支付' })); await waitFor(() => expect(screen.queryByRole('dialog', { name: '订单详情' })).toBeNull())
  expect(screen.queryByText('测试用户')).toBeNull(); expect(screen.getByText('待支付用户')).toBeTruthy()
  await actor.click(screen.getAllByRole('combobox')[0]); await actor.click(screen.getByRole('option', { name: '微信' })); await screen.findByText('暂无匹配的支付订单。'); expect(requests).toEqual(['/api/v1/admin/payment-orders'])
 })
})
