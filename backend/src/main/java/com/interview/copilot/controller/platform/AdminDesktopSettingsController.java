package com.interview.copilot.controller.platform;

import com.interview.copilot.request.platform.DesktopPermissionRequest;
import com.interview.copilot.request.platform.DesktopSettingsRequest;
import com.interview.copilot.response.platform.DesktopSettingsResponse;
import com.interview.copilot.response.platform.DesktopUserResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.validation.admin.AdminInput;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
@RestController
@RequestMapping("/api/v1/admin/desktop-settings")
public class AdminDesktopSettingsController {
    private final DesktopSettingsService settings;

    public AdminDesktopSettingsController(DesktopSettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    public DesktopSettingsResponse get() {
        return settings.get();
    }

    @PutMapping
    public DesktopSettingsResponse save(
            @AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody DesktopSettingsRequest input) {
        return settings.save(
                actor.id(),
                new DesktopSettingsResponse(
                        input.version(),
                        input.llmModelId(),
                        input.temperature(),
                        input.asrServiceId(),
                        input.retrievalMode(),
                        input.knowledgeServiceId()));
    }

    @GetMapping("/users")
    public List<DesktopUserResponse> users() {
        return settings.users();
    }

    @PutMapping("/users/{id}")
    @org.springframework.web.bind.annotation.ResponseStatus(
            org.springframework.http.HttpStatus.NO_CONTENT)
    public void permission(
            @AuthenticationPrincipal UserPrincipal actor,
            @PathVariable String id,
            @Valid @RequestBody DesktopPermissionRequest input) {
        settings.permission(actor.id(), AdminInput.id(id), input.enabled());
    }
}
