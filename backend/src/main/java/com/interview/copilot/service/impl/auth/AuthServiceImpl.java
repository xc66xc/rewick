package com.interview.copilot.service.impl.auth;

import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.auth.TokenMapper;
import com.interview.copilot.mapper.user.UserMapper;
import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.security.auth.SessionValidation;
import com.interview.copilot.security.auth.TokenSecrets;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.security.email.EmailAddress;
import com.interview.copilot.service.auth.AuthService;
import com.interview.copilot.service.auth.TokenIssuerService;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

@Service
public class AuthServiceImpl implements AuthService {
    private final UserMapper users;
    private final TokenMapper tokens;
    private final PasswordEncoder passwords;
    private final TokenIssuerService issuer;
    private final String absentPassword;

    public AuthServiceImpl(
            UserMapper users,
            TokenMapper tokens,
            PasswordEncoder passwords,
            TokenIssuerService issuer) {
        this.users = users;
        this.tokens = tokens;
        this.passwords = passwords;
        this.issuer = issuer;
        this.absentPassword = passwords.encode(TokenSecrets.create());
    }

    @Transactional
    public LoginResponse login(String identifier, String password, String clientType) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) throw invalidCredentials();
        UserEntity user = findLoginUser(identifier);
        if (user != null) {
            tokens.lockUser(user.getId());
            user = findLoginUser(identifier);
        }
        String hash = user == null ? absentPassword : user.getPasswordHash();
        boolean matches = passwords.matches(password, hash);
        if (!matches || user == null || !user.isEnabled()) throw invalidCredentials();
        if ("admin".equals(clientType) && !"ADMIN".equals(user.getRole()))
            throw invalidCredentials();
        return issuer.issue(user, clientType);
    }

    private UserEntity findLoginUser(String identifier) {
        if (identifier.contains("@")) {
            try {
                UserEntity emailUser = users.findForEmailLogin(EmailAddress.normalize(identifier));
                if (emailUser != null) return emailUser;
            } catch (ApiException error) {
                // Existing identifier accounts may include @ without being an email address.
                if (!"invalid_email".equals(error.code())) throw error;
            }
        }
        return users.findForLogin(identifier);
    }

    @Transactional
    public LoginResponse issueToken(UserEntity user) {
        return issuer.issue(user, "desktop");
    }

    public Optional<UserPrincipal> authenticate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return Optional.empty();
        var row = tokens.authenticate(TokenSecrets.hash(token));
        if (row == null) return Optional.empty();
        SessionValidation.require(row, tokens.now());
        return Optional.of(
                new UserPrincipal(
                        row.id(),
                        row.displayName(),
                        row.role(),
                        row.email(),
                        row.tokenId(),
                        row.clientType()));
    }

    public void logout(String token) {
        tokens.revoke(TokenSecrets.hash(token));
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "登录账号或密码不正确。");
    }
}
