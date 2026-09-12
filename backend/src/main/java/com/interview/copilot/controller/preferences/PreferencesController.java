package com.interview.copilot.controller.preferences;

import com.interview.copilot.request.preferences.SavePreferencesRequest;
import com.interview.copilot.response.preferences.PreferencesResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.preferences.PreferencesService;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PreferencesController {
    private final PreferencesService service;

    public PreferencesController(PreferencesService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/user-preferences")
    public PreferencesResponse get(@AuthenticationPrincipal UserPrincipal user) {
        return service.get(user.id());
    }

    @PostMapping("/api/v1/user-preferences")
    public PreferencesResponse save(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody SavePreferencesRequest body) {
        return service.save(user.id(), body.version(), body.mutationId(), body.preferences());
    }
}
