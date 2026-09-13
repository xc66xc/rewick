package com.interview.copilot.service.impl.auth;

import com.interview.copilot.config.AuthProperties;
import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.mapper.auth.TokenMapper;
import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.response.auth.PublicUserResponse;
import com.interview.copilot.security.auth.TokenSecrets;
import com.interview.copilot.service.auth.TokenIssuerService;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.util.ServerTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TokenIssuerServiceImpl implements TokenIssuerService {
    private final TokenMapper tokens;
    private final AuthProperties properties;
    private final WalletService wallets;

    public TokenIssuerServiceImpl(
            TokenMapper tokens, AuthProperties properties, WalletService wallets) {
        this.tokens = tokens;
        this.properties = properties;
        this.wallets = wallets;
    }

    @Transactional
    public LoginResponse issue(UserEntity user, String clientType) {
        tokens.lockUser(user.getId());
        if ("desktop".equals(clientType)) {
            if (tokens.hasActiveInterview(user.getId())) wallets.endCurrent(user.getId());
            tokens.replaceDesktop(user.getId());
        }
        String token = TokenSecrets.create();
        var expiry = tokens.now().plusHours(properties.tokenHours());
        tokens.create(user.getId(), TokenSecrets.hash(token), expiry, clientType);
        return new LoginResponse(
                token,
                ServerTime.instant(expiry),
                new PublicUserResponse(
                        user.getId().toString(),
                        user.getDisplayName(),
                        user.getRole(),
                        user.getEmail()));
    }
}
