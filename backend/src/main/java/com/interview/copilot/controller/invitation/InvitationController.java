package com.interview.copilot.controller.invitation;

import com.interview.copilot.response.invitation.InvitationSettingsResponse;
import com.interview.copilot.response.invitation.InvitationSummaryResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.invitation.InvitationService;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
@RestController
@RequestMapping("/api/v1/invitations")
public class InvitationController {
    private final InvitationService service;

    public InvitationController(InvitationService service) {
        this.service = service;
    }

    @GetMapping("/settings")
    public InvitationSettingsResponse settings() {
        return service.settings();
    }

    @GetMapping("/me")
    public InvitationSummaryResponse mine(@AuthenticationPrincipal UserPrincipal user) {
        return service.mine(user.id());
    }

    @PostMapping("/me/code")
    public InvitationSummaryResponse code(@AuthenticationPrincipal UserPrincipal user) {
        return service.ensureCode(user.id());
    }
}
