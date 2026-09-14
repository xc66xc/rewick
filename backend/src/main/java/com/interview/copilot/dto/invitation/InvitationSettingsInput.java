package com.interview.copilot.dto.invitation;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
public record InvitationSettingsInput(boolean enabled, long rewardSeconds, long version) {}
