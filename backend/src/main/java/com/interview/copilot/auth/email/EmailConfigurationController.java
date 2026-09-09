package com.interview.copilot.auth.email;

import com.interview.copilot.auth.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
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
    private final EmailConfigurationService service;
    private final EmailConfigurationProbe probe;

    public EmailConfigurationController(EmailConfigurationService service, EmailConfigurationProbe probe) {
        this.service = service;
        this.probe = probe;
    }

    @GetMapping public EmailConfiguration get() { return service.get(); }
    @PutMapping public EmailConfiguration publish(@AuthenticationPrincipal UserPrincipal user, @Valid @RequestBody EmailConfiguration config) {
        return service.publish(user.id(), config);
    }
    @PostMapping("/test") public EmailConfigurationProbe.Result test(@AuthenticationPrincipal UserPrincipal user, @Valid @RequestBody ProbeRequest body) {
        return probe.test(user.id(), body.config());
    }
    public record ProbeRequest(@NotNull @Valid EmailConfiguration config) {}
}
