import { z } from 'zod'
export const invitationSettingsSchema = z.object({ enabled: z.boolean(), rewardSeconds: z.number().int().min(0).max(315360000), version: z.number().int().nonnegative() })
export const invitationSummarySchema = z.object({ code: z.string().regex(/^([A-Z2-9]{6})?$/), enabled: z.boolean(), rewardSeconds: z.number().int().nonnegative(), invitedCount: z.number().int().nonnegative(), rewardedSeconds: z.number().int().nonnegative() })
export type InvitationSettings = z.infer<typeof invitationSettingsSchema>
export type InvitationSummary = z.infer<typeof invitationSummarySchema>
export const invitationErrors: Record<string, string> = {
  invalid_invitation_code: '邀请码无效或邀请人已停用，请修改或清空后继续注册。',
  invitation_disabled: '邀请活动已关闭，请清空邀请码后继续注册。',
  invitation_balance_limit: '邀请人时长已达上限，请联系管理员或清空邀请码后注册。',
  invitation_already_bound: '该账号已绑定邀请人。'
}
