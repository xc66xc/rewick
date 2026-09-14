package com.interview.copilot.request.invitation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
public record InvitationSettingsRequest(
        @NotNull Boolean enabled,
        @NotNull @Min(0) @Max(315360000) Long rewardSeconds,
        @NotNull @Min(0) Long version) {}
