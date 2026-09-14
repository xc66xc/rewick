package com.interview.copilot.response.invitation;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
public record InvitationSettingsResponse(boolean enabled, long rewardSeconds, long version) {}
