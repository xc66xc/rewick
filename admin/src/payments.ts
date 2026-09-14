import { z } from 'zod'
export const packageSchema = z.object({ id: z.number().int(), version: z.number().int(), name: z.string(), description: z.string(), durationSeconds: z.number().int(), originalPriceCents: z.number().int(), discountBps: z.number().int(), priceCents: z.number().int(), sortOrder: z.number().int(), enabled: z.boolean() })
export const packagesSchema = z.array(packageSchema)
export type TimePackage = z.infer<typeof packageSchema>
export type PackageDraft = Omit<TimePackage, 'id' | 'version' | 'priceCents'>
export const paymentConfigSchema = z.object({ version: z.number().int(), enabled: z.boolean(), configured: z.boolean(), mchId: z.string(), appId: z.string(), merchantSerial: z.string(), wechatPublicKeyId: z.string(), notifyUrl: z.string(), hasMerchantPrivateKey: z.boolean(), hasApiV3Key: z.boolean(), hasWechatPublicKey: z.boolean() })
export type PaymentConfig = z.infer<typeof paymentConfigSchema>
export interface PaymentSecrets { merchantPrivateKey: string; apiV3Key: string; wechatPublicKey: string }
export const alipayConfigSchema = z.object({ version: z.number().int(), enabled: z.boolean(), configured: z.boolean(), appId: z.string(), sellerId: z.string(), gatewayUrl: z.string(), notifyUrl: z.string(), returnUrl: z.string(), hasAppPrivateKey: z.boolean(), hasAlipayPublicKey: z.boolean() })
export type AlipayConfig = z.infer<typeof alipayConfigSchema>
export const paymentMethodSchema = z.enum(['wechat', 'alipay', 'zpay'])
export function paymentMethodName(method: z.infer<typeof paymentMethodSchema>): string { return method === 'zpay' ? 'ZPAY' : method === 'alipay' ? '支付宝' : '微信' }
export const paymentOrderSchema = z.object({ id: z.string(), paymentMethod: paymentMethodSchema, userId: z.number().int(), displayName: z.string(), packageName: z.string(), durationSeconds: z.number().int(), totalCents: z.number().int(), status: z.string(), credited: z.boolean(), codeUrl: z.string().nullable(), createdAt: z.string(), expiresAt: z.string(), paidAt: z.string().nullable(), refundedCents: z.number().int(), deductedSeconds: z.number().int() })
export const paymentOrdersSchema = z.array(paymentOrderSchema)
export type PaymentOrder = z.infer<typeof paymentOrderSchema>
export function money(cents: number): string { return `¥${(cents / 100).toFixed(2)}` }
export function paymentStatus(order: PaymentOrder): string {
  if (order.status === 'paid') return order.credited ? '已支付 · 已到账' : '已支付 · 待到账'
  return ({ creating: '创建中', pending: '待支付', cancelling: '取消确认中', closed: '已关闭' } as Record<string, string>)[order.status] ?? order.status
}

export const zpayConfigSchema = z.object({ version: z.number().int(), enabled: z.boolean(), configured: z.boolean(), pid: z.string(), paymentType: z.enum(['alipay', 'wxpay']), gatewayUrl: z.string(), queryUrl: z.string(), notifyUrl: z.string(), returnUrl: z.string(), cid: z.string(), hasMerchantKey: z.boolean() })
export type ZpayConfig = z.infer<typeof zpayConfigSchema>
