package com.interview.copilot.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    private final LoginRateLimiter limiter;
    private final com.interview.copilot.wallet.WalletService wallets;

    public AuthController(AuthService auth, LoginRateLimiter limiter, com.interview.copilot.wallet.WalletService wallets) {
        this.auth = auth;
        this.limiter = limiter;
        this.wallets = wallets;
    }

    @PostMapping("/login")
    public AuthService.LoginResult login(@Valid @RequestBody LoginRequest body, HttpServletRequest request) {
        limiter.acquire(request.getRemoteAddr(), body.identifier());
        return auth.login(body.identifier(), body.password());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        auth.authenticate(request.getHeader(HttpHeaders.AUTHORIZATION).substring(7)).ifPresent(user -> wallets.endCurrent(user.id()));
        auth.logout(request.getHeader(HttpHeaders.AUTHORIZATION).substring(7));
        return ResponseEntity.noContent().build();
    }

    public record LoginRequest(
            @NotBlank @Size(min = 3, max = 254) String identifier,
            @NotBlank @Size(max = 128) String password) {
        @Override
        public String toString() { return "LoginRequest[password=redacted]"; }
    }
}
