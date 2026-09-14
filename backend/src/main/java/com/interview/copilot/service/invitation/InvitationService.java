package com.interview.copilot.service.invitation;

import com.interview.copilot.response.invitation.InvitationSettingsResponse;
import com.interview.copilot.response.invitation.InvitationSummaryResponse;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
public interface InvitationService {
    InvitationSettingsResponse settings();

    InvitationSummaryResponse mine(long userId);

    InvitationSummaryResponse ensureCode(long userId);

    void reward(long inviteeId, String code);
}
