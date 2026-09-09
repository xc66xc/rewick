package com.interview.copilot.auth.email;

import com.interview.copilot.auth.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class EmailAuthController {
    private final EmailAuthService service;
    private final EmailRateLimiter limiter;
    private final EmailAuthProperties policy;

    public EmailAuthController(EmailAuthService service, EmailRateLimiter limiter, EmailAuthProperties policy) {
        this.service = service;
        this.limiter = limiter;
        this.policy = policy;
    }

    @PostMapping("/email-code")
    public CodeResponse code(@Valid @RequestBody CodeRequest body, HttpServletRequest request) {
        limiter.send(request.getRemoteAddr());
        service.sendCode(EmailAddress.normalize(body.email()));
        return new CodeResponse(policy.resendSeconds(), policy.codeTtlSeconds());
    }

    @PostMapping("/register")
    public ResponseEntity<AuthService.LoginResult> register(@Valid @RequestBody RegisterRequest body, HttpServletRequest request) {
        limiter.register(request.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.CREATED).body(service.register(EmailAddress.normalize(body.email()), body.password(), body.code()));
    }

    public record CodeRequest(@NotBlank @Size(max = 254) String email) {}
    public record CodeResponse(int retryAfterSeconds, int expiresInSeconds) {}
    public record RegisterRequest(@NotBlank @Size(max = 254) String email,
            @NotBlank @Size(max = 72) String password, @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {
        @Override public String toString() { return "RegisterRequest[password=redacted, code=redacted]"; }
    }
}
