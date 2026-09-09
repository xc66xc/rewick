package com.interview.copilot.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.interview.copilot.auth.email.EmailAddress;
import com.interview.copilot.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserMapper users;
    private final TokenMapper tokens;
    private final PasswordEncoder passwords;
    private final AuthProperties properties;
    private final Clock clock;
    private final String absentPassword;

    public AuthService(UserMapper users, TokenMapper tokens, PasswordEncoder passwords,
            AuthProperties properties, Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.passwords = passwords;
        this.properties = properties;
        this.clock = clock;
        this.absentPassword = passwords.encode(TokenSecrets.create());
    }

    @Transactional
    public LoginResult login(String identifier, String password) {
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
    public LoginResult issueToken(UserEntity user) {
        String token = TokenSecrets.create();
        Instant expiresAt = clock.instant().plus(properties.tokenHours(), ChronoUnit.HOURS);
        tokens.create(user.getId(), TokenSecrets.hash(token), expiresAt);
        return new LoginResult(token, expiresAt, new PublicUser(user.getId().toString(), user.getDisplayName(), user.getRole(), user.getEmail()));
    }

    public Optional<UserPrincipal> authenticate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) return Optional.empty();
        return Optional.ofNullable(tokens.authenticate(TokenSecrets.hash(token), clock.instant()));
    }

    public void logout(String token) { tokens.revoke(TokenSecrets.hash(token)); }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "登录账号或密码不正确。");
    }

    public record PublicUser(String id, String displayName, String role, @JsonInclude(JsonInclude.Include.NON_NULL) String email) {
        public PublicUser(String id, String displayName, String role) { this(id, displayName, role, null); }
        public PublicUser(String id, String displayName) { this(id, displayName, "USER"); }
    }
    public record LoginResult(String accessToken, Instant expiresAt, PublicUser user) {
        @Override
        public String toString() { return "LoginResult[accessToken=redacted]"; }
    }
}
