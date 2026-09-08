package com.interview.copilot.admin.config;

import com.interview.copilot.auth.UserPrincipal;
import com.interview.copilot.platform.PlatformConfig;
import com.interview.copilot.platform.PlatformConfigService;
import com.interview.copilot.platform.PlatformProbeService;
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
    private final PlatformConfigService configs;
    private final PlatformProbeService probes;

    public AdminConfigController(PlatformConfigService configs, PlatformProbeService probes) {
        this.configs = configs;
        this.probes = probes;
    }

    @GetMapping public PlatformConfig get() { return configs.get(); }
    @PutMapping public PlatformConfig publish(@AuthenticationPrincipal UserPrincipal actor, @Valid @RequestBody PlatformConfig input) {
        return configs.publish(actor.id(), input);
    }
    @PostMapping("/test") public PlatformProbeService.Result test(@AuthenticationPrincipal UserPrincipal actor,
                                                                  @RequestBody PlatformProbeService.Request input) {
        return probes.test(actor.id(), input);
    }
}
