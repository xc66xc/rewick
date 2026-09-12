package com.interview.copilot.service.impl.auth;

import com.interview.copilot.config.AuthProperties;
import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.auth.TokenMapper;
import com.interview.copilot.mapper.user.UserMapper;
import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.response.auth.PublicUserResponse;
import com.interview.copilot.security.auth.TokenSecrets;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.security.email.EmailAddress;
import com.interview.copilot.service.auth.AuthService;
import com.interview.copilot.util.ServerTime;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class AuthServiceImpl implements AuthService {
    private final UserMapper users;
    private final TokenMapper tokens;
    private final PasswordEncoder passwords;
    private final AuthProperties properties;
    private final Clock clock;
    private final String absentPassword;

    public AuthServiceImpl(
            UserMapper users,
            TokenMapper tokens,
            PasswordEncoder passwords,
            AuthProperties properties,
            Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.passwords = passwords;
        this.properties = properties;
        this.clock = clock;
        this.absentPassword = passwords.encode(TokenSecrets.create());
    }

    @Transactional
    public LoginResponse login(String identifier, String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) throw invalidCredentials();
        UserEntity user = findLoginUser(identifier);
        String hash = user == null ? absentPassword : user.getPasswordHash();
        boolean matches = passwords.matches(password, hash);
        if (!matches || user == null || !user.isEnabled()) throw invalidCredentials();
        return issueToken(user);
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
        String token = TokenSecrets.create();
        LocalDateTime expiresAt = ServerTime.now(clock).plusHours(properties.tokenHours());
        tokens.create(user.getId(), TokenSecrets.hash(token), expiresAt);
        return new LoginResponse(
                token,
                ServerTime.instant(expiresAt),
                new PublicUserResponse(
                        user.getId().toString(),
                        user.getDisplayName(),
                        user.getRole(),
                        user.getEmail()));
    }

    public Optional<UserPrincipal> authenticate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return Optional.empty();
        return Optional.ofNullable(
                tokens.authenticate(TokenSecrets.hash(token), ServerTime.now(clock)));
    }

    public void logout(String token) {
        tokens.revoke(TokenSecrets.hash(token));
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "登录账号或密码不正确。");
    }
}
