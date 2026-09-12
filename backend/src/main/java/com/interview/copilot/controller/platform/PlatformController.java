package com.interview.copilot.controller.platform;

import com.interview.copilot.response.platform.PlatformResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.platform.PlatformCatalogService;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/platform")
public class PlatformController {
    private final PlatformCatalogService service;

    public PlatformController(PlatformCatalogService service) {
        this.service = service;
    }

    @GetMapping
    public PlatformResponse platform(@AuthenticationPrincipal UserPrincipal user) {
        return service.get(user);
    }
}
