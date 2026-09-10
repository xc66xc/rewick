package com.interview.copilot.auth.email;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth/password-reset")
public class EmailPasswordResetController {
    private final EmailPasswordResetService service;
    private final EmailRateLimiter limiter;
    private final EmailAuthProperties policy;

    public EmailPasswordResetController(EmailPasswordResetService service, EmailRateLimiter limiter,
            EmailAuthProperties policy) {
        this.service = service;
        this.limiter = limiter;
        this.policy = policy;
    }

    @PostMapping("/email-code")
    public EmailAuthController.CodeResponse code(@Valid @RequestBody EmailAuthController.CodeRequest body,
            HttpServletRequest request) {
        limiter.send(request.getRemoteAddr());
        service.sendCode(EmailAddress.normalize(body.email()));
        return new EmailAuthController.CodeResponse(policy.resendSeconds(), policy.codeTtlSeconds());
    }

    @PostMapping
    public ResponseEntity<Void> reset(@Valid @RequestBody EmailAuthController.RegisterRequest body,
            HttpServletRequest request) {
        limiter.register(request.getRemoteAddr());
        service.resetPassword(EmailAddress.normalize(body.email()), body.password(), body.code());
        return ResponseEntity.noContent().build();
    }
}
