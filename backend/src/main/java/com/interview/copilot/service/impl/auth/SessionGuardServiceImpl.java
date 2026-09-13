package com.interview.copilot.service.impl.auth;

import com.interview.copilot.mapper.auth.TokenMapper;
import com.interview.copilot.security.auth.CurrentLogin;
import com.interview.copilot.security.auth.SessionValidation;
import com.interview.copilot.service.auth.SessionGuardService;

import org.springframework.stereotype.Service;

@Service
public class SessionGuardServiceImpl implements SessionGuardService {
    private final TokenMapper tokens;

    public SessionGuardServiceImpl(TokenMapper tokens) {
        this.tokens = tokens;
    }

    public void requireSession(long userId, long tokenId) {
        var row = tokens.byId(tokenId);
        SessionValidation.require(row, tokens.now());
        if (row.id() != userId || !"desktop".equals(row.clientType()))
            throw SessionValidation.expired();
    }

    public Long lockUser(long userId) {
        var locked = tokens.lockUser(userId);
        var principal = CurrentLogin.principal();
        if (principal != null && principal.tokenId() > 0)
            SessionValidation.require(tokens.byId(principal.tokenId()), tokens.now());
        return locked;
    }
}
