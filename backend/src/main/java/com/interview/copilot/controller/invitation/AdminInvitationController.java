package com.interview.copilot.controller.invitation;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.invitation.InvitationSettingsInput;
import com.interview.copilot.request.invitation.InvitationSettingsRequest;
import com.interview.copilot.response.invitation.InvitationRecordResponse;
import com.interview.copilot.response.invitation.InvitationSettingsResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.invitation.AdminInvitationService;
import com.interview.copilot.service.invitation.InvitationService;
import com.interview.copilot.validation.admin.AdminInput;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminInvitationController {
    private final InvitationService invitations;
    private final AdminInvitationService service;

    public AdminInvitationController(
            InvitationService invitations, AdminInvitationService service) {
        this.invitations = invitations;
        this.service = service;
    }

    @GetMapping("/invitation-settings")
    public InvitationSettingsResponse settings() {
        return invitations.settings();
    }

    @PutMapping("/invitation-settings")
    public InvitationSettingsResponse save(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody InvitationSettingsRequest input) {
        return service.save(
                user.id(),
                new InvitationSettingsInput(
                        input.enabled(), input.rewardSeconds(), input.version()));
    }

    @GetMapping("/invitations")
    public Page<InvitationRecordResponse> records(
            @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "1") String page,
            @RequestParam(defaultValue = "20") String size) {
        return service.records(search, AdminInput.paging(page, size));
    }
}
