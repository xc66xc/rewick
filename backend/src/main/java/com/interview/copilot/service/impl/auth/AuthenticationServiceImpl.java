package com.interview.copilot.service.impl.auth;

import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.security.auth.LoginRateLimiter;
import com.interview.copilot.service.auth.AuthService;
import com.interview.copilot.service.auth.AuthenticationService;
import com.interview.copilot.service.wallet.WalletService;

import org.springframework.stereotype.Service;

@Service
public class AuthenticationServiceImpl implements AuthenticationService {
    private final AuthService auth;
    private final LoginRateLimiter limiter;
    private final WalletService wallets;

    public AuthenticationServiceImpl(
            AuthService auth, LoginRateLimiter limiter, WalletService wallets) {
        this.auth = auth;
        this.limiter = limiter;
        this.wallets = wallets;
    }

    public LoginResponse login(String address, String identifier, String password) {
        limiter.acquire(address, identifier);
        return auth.login(identifier, password);
    }

    public void logout(String token) {
        auth.authenticate(token).ifPresent(user -> wallets.endCurrent(user.id()));
        auth.logout(token);
    }
}
