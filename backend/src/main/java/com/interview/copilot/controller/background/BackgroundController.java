package com.interview.copilot.controller.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.request.background.SaveBackgroundRequest;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.background.BackgroundService;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/background")
public class BackgroundController {
    private final BackgroundService service;

    public BackgroundController(BackgroundService service) {
        this.service = service;
    }

    @GetMapping
    public JsonNode library(@AuthenticationPrincipal UserPrincipal user) {
        return service.library(user.id());
    }

    @GetMapping("/{kind}/{id}")
    public JsonNode detail(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable BackgroundKind kind,
            @PathVariable String id) {
        return service.detail(user.id(), kind, id);
    }

    @PostMapping("/{kind}/{id}")
    public JsonNode save(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable BackgroundKind kind,
            @PathVariable String id,
            @Valid @RequestBody SaveBackgroundRequest body) {
        return service.save(user.id(), kind, id, body.version(), body.mutationId(), body.content());
    }

    @PostMapping("/{kind}/{id}/delete")
    public void delete(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable BackgroundKind kind,
            @PathVariable String id) {
        service.delete(user.id(), kind, id);
    }

    @PostMapping("/environments/{id}/activate")
    public void activate(@AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        service.activate(user.id(), id);
    }
}
