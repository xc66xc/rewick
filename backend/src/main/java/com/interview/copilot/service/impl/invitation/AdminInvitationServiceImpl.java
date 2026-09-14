package com.interview.copilot.service.impl.invitation;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.invitation.InvitationSettingsInput;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.audit.AuditMapper;
import com.interview.copilot.mapper.invitation.InvitationMapper;
import com.interview.copilot.response.invitation.InvitationRecordResponse;
import com.interview.copilot.response.invitation.InvitationSettingsResponse;
import com.interview.copilot.service.invitation.AdminInvitationService;
import com.interview.copilot.util.ServerTime;
import com.interview.copilot.validation.admin.AdminInput;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
@Service
public class AdminInvitationServiceImpl implements AdminInvitationService {
    private final InvitationMapper mapper;
    private final AuditMapper audit;
    private final Clock clock;

    public AdminInvitationServiceImpl(InvitationMapper mapper, AuditMapper audit, Clock clock) {
        this.mapper = mapper;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public InvitationSettingsResponse save(long actorId, InvitationSettingsInput input) {
        if (!mapper.admin(actorId))
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "无权修改邀请奖励。");
        if (input.rewardSeconds() < 0 || input.rewardSeconds() > 315360000L || input.version() < 0)
            throw AdminInput.invalid();
        if (mapper.saveSettings(input, ServerTime.now(clock)) != 1)
            throw new ApiException(
                    HttpStatus.CONFLICT, "invitation_settings_conflict", "邀请配置已更新，请重新加载后修改。");
        audit.record(
                actorId,
                "invitation_settings_update",
                "enabled=" + input.enabled() + ",rewardSeconds=" + input.rewardSeconds());
        return new InvitationSettingsResponse(
                input.enabled(), input.rewardSeconds(), input.version() + 1);
    }

    public Page<InvitationRecordResponse> records(String search, AdminInput.Paging paging) {
        String query = AdminInput.bounded(search, 254).trim();
        var items =
                mapper.page(query, paging.size(), paging.offset()).stream()
                        .map(
                                value ->
                                        new InvitationRecordResponse(
                                                value.id(),
                                                value.inviterName(),
                                                value.inviterEmail(),
                                                value.inviteeName(),
                                                value.inviteeEmail(),
                                                value.code(),
                                                value.rewardSeconds(),
                                                ServerTime.instant(value.createdAt())))
                        .toList();
        return new Page<>(items, mapper.count(query), paging.page(), paging.size());
    }
}
