package com.interview.copilot.service.impl.auth;

import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.security.auth.LoginRateLimiter;
import com.interview.copilot.service.auth.AuthService;
import com.interview.copilot.service.auth.AuthenticationService;
import com.interview.copilot.service.wallet.WalletService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public LoginResponse login(
            String address, String identifier, String password, String clientType) {
        limiter.acquire(address, identifier);
        return auth.login(identifier, password, clientType);
    }

    @Transactional
    public void logout(String token) {
        auth.authenticate(token)
                .filter(user -> "desktop".equals(user.clientType()))
                .ifPresent(user -> wallets.endCurrent(user.id()));
        auth.logout(token);
    }
}
