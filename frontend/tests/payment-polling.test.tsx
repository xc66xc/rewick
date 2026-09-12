// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import usePayments from '../src/renderer/src/hooks/usePayments'
import type { DesktopBridge } from '../src/shared/types'
import type { PaymentOrder } from '../src/shared/payment'
import { toast } from '../src/renderer/src/components/ui/toast'
vi.mock('../src/renderer/src/components/ui/toast', () => ({ toast: { show: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('reports a polling failure once while retaining retries', async () => {
  const refreshPaymentOrder = vi.fn(async () => { throw new Error('网络中断') })
  const bridge = { getPackageCatalog: async () => ({ paymentAvailable: true, paymentMethods: ['wechat'], packages: [] }), getPaymentOrders: async () => [], refreshPaymentOrder } as unknown as DesktopBridge
  const { result } = renderHook(() => usePayments(bridge, 'account-one', async () => undefined))
  await waitFor(() => expect(result.current.loading).toBe(false))
  const order = { id: 'order-1' } as PaymentOrder
  await result.current.refresh(order, true)
  await result.current.refresh(order, true)
  expect(refreshPaymentOrder).toHaveBeenCalledTimes(2)
  expect(toast.show).toHaveBeenCalledTimes(1)
  expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('订单不会丢失'), expect.anything())
})
