package com.interview.copilot.response.invitation;

import java.time.Instant;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
public record InvitationRecordResponse(
        String id,
        String inviterName,
        String inviterEmail,
        String inviteeName,
        String inviteeEmail,
        String code,
        long rewardSeconds,
        Instant createdAt) {}
