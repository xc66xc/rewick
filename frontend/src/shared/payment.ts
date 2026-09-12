import { z } from 'zod'

const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const timePackageSchema = z.object({
  id: amount, version: amount, name: z.string(), description: z.string(), durationSeconds: amount,
  originalPriceCents: amount, discountBps: z.number().int().min(1).max(10000), priceCents: amount,
  sortOrder: z.number().int(), enabled: z.boolean()
})
export const paymentMethodSchema = z.enum(['wechat', 'alipay'])
export type PaymentMethod = z.infer<typeof paymentMethodSchema>
export const packageCatalogSchema = z.object({ paymentAvailable: z.boolean(), paymentMethods: z.array(paymentMethodSchema), packages: z.array(timePackageSchema) })
export const paymentOrderSchema = z.object({
  id: z.string().min(1).max(100), paymentMethod: paymentMethodSchema, userId: amount, displayName: z.string(), packageName: z.string(),
  durationSeconds: amount, totalCents: amount, status: z.enum(['creating', 'pending', 'paid', 'closed']), credited: z.boolean(),
  codeUrl: z.string().max(2048).nullable(), createdAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  paidAt: z.string().datetime({ offset: true }).nullable(), refundedCents: amount, deductedSeconds: amount
})
export const createPaymentOrderSchema = z.object({ packageId: amount, packageVersion: amount, paymentMethod: paymentMethodSchema, requestId: z.string().uuid() })
export type TimePackage = z.infer<typeof timePackageSchema>
export type PackageCatalog = z.infer<typeof packageCatalogSchema>
export type PaymentOrder = z.infer<typeof paymentOrderSchema>
export type CreatePaymentOrder = z.infer<typeof createPaymentOrderSchema>
