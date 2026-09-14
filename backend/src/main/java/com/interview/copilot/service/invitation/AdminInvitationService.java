package com.interview.copilot.service.invitation;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.invitation.InvitationSettingsInput;
import com.interview.copilot.response.invitation.InvitationRecordResponse;
import com.interview.copilot.response.invitation.InvitationSettingsResponse;
import com.interview.copilot.validation.admin.AdminInput;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
public interface AdminInvitationService {
    InvitationSettingsResponse save(long actorId, InvitationSettingsInput input);

    Page<InvitationRecordResponse> records(String search, AdminInput.Paging paging);
}
