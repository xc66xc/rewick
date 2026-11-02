import { z } from 'zod'
export const invitationSettingsSchema = z.object({ enabled: z.boolean(), rewardSeconds: z.number(), version: z.number() })
export const invitationRecordsSchema = z.object({ page: z.number(), size: z.number(), total: z.number(), items: z.array(z.object({ id: z.string(), inviterName: z.string(), inviterEmail: z.string().nullable(), inviteeName: z.string(), inviteeEmail: z.string().nullable(), code: z.string(), rewardSeconds: z.number(), createdAt: z.string() })) })
export type InvitationSettings = z.infer<typeof invitationSettingsSchema>
export type Invitation = z.infer<typeof invitationRecordsSchema>['items'][number]
