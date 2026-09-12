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
  async cancel(input: unknown) {
    const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).parse(input)
    return paymentOrderSchema.parse(await this.request(`/payment-orders/${id}/cancel`, {}))
  }
  async refresh(input: unknown) {
    const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).parse(input)
    return paymentOrderSchema.parse(await this.request(`/payment-orders/${id}/refresh`, {}))
  }
}
