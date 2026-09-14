import { z } from 'zod'
import { PlatformClient } from './platform-client'
import { createPaymentOrderSchema, packageCatalogSchema, paymentOrderSchema } from '../../shared/payment'

export class PaymentClient {
  constructor(private readonly connection: { baseUrl: string; token: string }, private readonly signal?: AbortSignal) {}
  private request(path: string, body?: unknown) {
    return new PlatformClient(this.connection.baseUrl, 35000).paymentRequest(`/api/v1${path}`, this.connection.token, body, this.signal)
  }
  async catalog() { return packageCatalogSchema.parse(await this.request('/packages')) }
  async orders() { return z.array(paymentOrderSchema).parse(await this.request('/payment-orders')) }
  async create(input: unknown) {
    return paymentOrderSchema.parse(await this.request('/payment-orders', createPaymentOrderSchema.parse(input)))
  }
  async checkout(input: unknown) {
    const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).parse(input)
    const response = z.object({ checkoutUrl: z.string().max(2048) }).parse(await this.request(`/payment-orders/${id}/checkout`, {}))
    const url = new URL(response.checkoutUrl, this.connection.baseUrl)
    if (url.protocol !== 'https:' || url.origin !== new URL(this.connection.baseUrl).origin
      || url.pathname !== '/api/v1/payments/alipay/checkout' || url.username || url.password || url.hash
      || !/^[a-f0-9]{64}$/.test(url.searchParams.get('ticket') ?? '') || [...url.searchParams].length !== 1) {
      throw new Error('付款入口无效，请联系管理员。')
    }
    return url.href
  }
  async cancel(input: unknown) {
    const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).parse(input)
    return paymentOrderSchema.parse(await this.request(`/payment-orders/${id}/cancel`, {}))
  }
  async refresh(input: unknown) {
    const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).parse(input)
    return paymentOrderSchema.parse(await this.request(`/payment-orders/${id}/refresh`, {}))
  }
}
