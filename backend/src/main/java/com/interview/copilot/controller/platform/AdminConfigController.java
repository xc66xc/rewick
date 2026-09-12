package com.interview.copilot.controller.platform;

import com.interview.copilot.request.platform.PlatformConfigRequest;
import com.interview.copilot.request.platform.PlatformProbeRequest;
import com.interview.copilot.response.platform.PlatformConfigResponse;
import com.interview.copilot.response.platform.PlatformProbeResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.platform.AdminPlatformConfigService;
import com.interview.copilot.service.platform.PlatformProbeService;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/config")
public final class AdminConfigController {
    private final AdminPlatformConfigService configs;
    private final PlatformProbeService probes;

    public AdminConfigController(AdminPlatformConfigService configs, PlatformProbeService probes) {
        this.configs = configs;
        this.probes = probes;
    }

    @GetMapping
    public PlatformConfigResponse get() {
        return configs.get();
    }

    @PutMapping
    public PlatformConfigResponse publish(
            @AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody PlatformConfigRequest input) {
        return configs.publish(actor.id(), input);
    }

    @PostMapping("/test")
    public PlatformProbeResponse test(
            @AuthenticationPrincipal UserPrincipal actor, @RequestBody PlatformProbeRequest input) {
        return probes.test(actor.id(), input);
    }
}
