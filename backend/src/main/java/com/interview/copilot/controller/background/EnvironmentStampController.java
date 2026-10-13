package com.interview.copilot.controller.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.background.EnvironmentStampService;
import com.interview.copilot.validation.background.EnvironmentStampPolicy;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EnvironmentStampController {
    private final EnvironmentStampService service;

    public EnvironmentStampController(EnvironmentStampService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/background/environments/{id}/stamp")
    public JsonNode save(@AuthenticationPrincipal UserPrincipal user, @PathVariable String id,
            @RequestBody JsonNode body) {
        var request = EnvironmentStampPolicy.request(body);
        return service.save(user.id(), id, request.version(), request.mutationId(), request.stamp());
    }
}
