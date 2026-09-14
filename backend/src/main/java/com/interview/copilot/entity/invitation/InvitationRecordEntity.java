package com.interview.copilot.entity.invitation;

import java.time.LocalDateTime;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
public record InvitationRecordEntity(
        String id,
        String inviterName,
        String inviterEmail,
        String inviteeName,
        String inviteeEmail,
        String code,
        long rewardSeconds,
        LocalDateTime createdAt) {}
