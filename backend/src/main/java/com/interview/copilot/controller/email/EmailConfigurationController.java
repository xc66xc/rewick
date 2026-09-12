package com.interview.copilot.controller.email;

import com.interview.copilot.request.email.EmailConfigRequest;
import com.interview.copilot.request.email.EmailProbeRequest;
import com.interview.copilot.response.email.EmailConfigResponse;
import com.interview.copilot.response.email.EmailProbeResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.email.AdminEmailConfigService;
import com.interview.copilot.service.email.EmailProbeService;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/email-config")
public class EmailConfigurationController {
    private final AdminEmailConfigService service;
    private final EmailProbeService probe;

    public EmailConfigurationController(AdminEmailConfigService service, EmailProbeService probe) {
        this.service = service;
        this.probe = probe;
    }

    @GetMapping
    public EmailConfigResponse get() {
        return service.get();
    }

    @PutMapping
    public EmailConfigResponse publish(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody EmailConfigRequest config) {
        return service.publish(user.id(), config);
    }

    @PostMapping("/test")
    public EmailProbeResponse test(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody EmailProbeRequest body) {
        return probe.test(user.id(), body.config());
    }
}
