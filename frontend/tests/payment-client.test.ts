import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentClient } from '../src/main/services/payment-client'

const connection = { baseUrl: 'https://platform.example', token: 'test-token' }
afterEach(() => vi.unstubAllGlobals())
describe('PaymentClient', () => {
  it('uses authenticated platform catalog and validates response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ paymentAvailable: false, paymentMethods: [], packages: [] })))
    vi.stubGlobal('fetch', fetcher)
    expect(await new PaymentClient(connection).catalog()).toEqual({ paymentAvailable: false, paymentMethods: [], packages: [] })
    expect(fetcher).toHaveBeenCalledWith('https://platform.example/api/v1/packages', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }))
  })
  it('rejects order paths before network access', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(new PaymentClient(connection).refresh('../admin')).rejects.toThrow()
    await expect(new PaymentClient(connection).cancel('../admin')).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('cancels through the authenticated order endpoint', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(new PaymentClient(connection).cancel('order-1')).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledWith('https://platform.example/api/v1/payment-orders/order-1/cancel', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }))
  })
  it('explains changed package rather than accepting a stale price', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 409 })))
    await expect(new PaymentClient(connection).create({ packageId: 1, packageVersion: 1, paymentMethod: 'wechat', requestId: crypto.randomUUID() })).rejects.toThrow('套餐已变更')
  })
  it('sends the same caller idempotency key when retried', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response('', { status: 503 })); vi.stubGlobal('fetch', fetcher)
    const input = { packageId: 1, packageVersion: 1, paymentMethod: 'wechat', requestId: crypto.randomUUID() }
    const client = new PaymentClient(connection)
    await client.create(input).catch(() => undefined); await client.create(input).catch(() => undefined)
    expect(fetcher.mock.calls[0][1]?.body).toEqual(fetcher.mock.calls[1][1]?.body)
  })
  it('rejects absent or unknown payment channels before making a request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const client = new PaymentClient(connection)
    const input = { packageId: 1, packageVersion: 1, requestId: crypto.randomUUID() }
    await expect(client.create(input)).rejects.toThrow()
    await expect(client.create({ ...input, paymentMethod: 'other' })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

})
