package com.interview.copilot.service.impl.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.interview.copilot.config.AuthProperties;
import com.interview.copilot.entity.auth.AuthenticatedUserEntity;
import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.auth.TokenMapper;
import com.interview.copilot.mapper.user.UserMapper;
import com.interview.copilot.security.auth.TokenSecrets;
import com.interview.copilot.service.auth.AuthService;
import com.interview.copilot.service.wallet.WalletService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Instant;
import java.time.LocalDateTime;

public class AuthServiceTest {
    private final UserMapper users = mock(UserMapper.class);
    private final TokenMapper tokens = mock(TokenMapper.class);
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    private final Instant now = Instant.parse("2026-09-08T00:00:00Z");
    private AuthService service;

    @BeforeEach
    void setUp() {
        when(tokens.now()).thenReturn(LocalDateTime.parse("2026-09-08T08:00:00"));
        service =
                new AuthServiceImpl(
                        users,
                        tokens,
                        passwords,
                        new TokenIssuerServiceImpl(
                                tokens,
                                new AuthProperties(24, 10, 60, "", ""),
                                mock(WalletService.class)));
    }

    @Test
    void login_validCredentials_storesOnlyHashWithExpiry() {
        when(users.findForLogin("alice")).thenReturn(user("alice", true));

        var result = service.login("alice", "a-test-password", "desktop");

        ArgumentCaptor<String> stored = ArgumentCaptor.forClass(String.class);
        verify(tokens)
                .create(
                        eq(7L),
                        stored.capture(),
                        eq(LocalDateTime.parse("2026-09-09T08:00:00")),
                        eq("desktop"));
        assertThat(stored.getValue()).hasSize(64).isNotEqualTo(result.accessToken());
        assertThat(result.accessToken()).matches("[A-Za-z0-9_-]{43}");
        assertThat(result.user().id()).isEqualTo("7");
        assertThat(result.expiresAt()).isEqualTo(now.plusSeconds(86400));
        assertThat(result.toString()).doesNotContain(result.accessToken());
    }

    @Test
    void login_wrongPassword_doesNotIssueToken() {
        when(users.findForLogin("alice")).thenReturn(user("alice", true));

        assertThatThrownBy(() -> service.login("alice", "wrong-password", "desktop"))
                .isInstanceOf(ApiException.class)
                .hasMessage("登录账号或密码不正确。");
        verify(tokens, never()).create(anyLong(), anyString(), any(), anyString());
    }

    @Test
    void login_disabledUser_rejectsCorrectPassword() {
        when(users.findForLogin("alice")).thenReturn(user("alice", false));

        assertThatThrownBy(() -> service.login("alice", "a-test-password", "desktop"))
                .isInstanceOf(ApiException.class);
        verify(tokens, never()).create(anyLong(), anyString(), any(), anyString());
    }

    @Test
    void login_missingUser_usesSameSafeError() {
        assertThatThrownBy(() -> service.login("missing", "a-test-password", "desktop"))
                .isInstanceOf(ApiException.class)
                .hasMessage("登录账号或密码不正确。");
    }

    @Test
    void authenticate_malformedToken_doesNotQueryStorage() {
        assertThat(service.authenticate("not-an-opaque-token")).isEmpty();
        verify(tokens, never()).authenticate(any());
    }

    @Test
    void authenticate_validToken_preservesIdentityAndRoleInSecurityPrincipal() {
        String token = TokenSecrets.create();
        when(tokens.authenticate(TokenSecrets.hash(token)))
                .thenReturn(
                        new AuthenticatedUserEntity(
                                7L,
                                "Alice",
                                "ADMIN",
                                "alice@example.test",
                                9L,
                                "desktop",
                                false,
                                "",
                                true,
                                LocalDateTime.parse("2026-09-09T08:00:00")));

        var principal = service.authenticate(token).orElseThrow();

        assertThat(principal.id()).isEqualTo(7L);
        assertThat(principal.getName()).isEqualTo("Alice");
        assertThat(principal.role()).isEqualTo("ADMIN");
        assertThat(principal.email()).isEqualTo("alice@example.test");
    }

    @Test
    void authenticate_unknownOrExpiredToken_doesNotCreatePrincipal() {
        assertThat(service.authenticate(TokenSecrets.create())).isEmpty();
    }

    @Test
    void logout_opaqueToken_revokesItsHash() {
        String token = TokenSecrets.create();

        service.logout(token);

        verify(tokens).revoke(TokenSecrets.hash(token));
    }

    private UserEntity user(String displayName, boolean enabled) {
        UserEntity user = new UserEntity();
        user.setId(7L);
        user.setDisplayName(displayName);
        user.setPasswordHash(passwords.encode("a-test-password"));
        user.setEnabled(enabled);
        return user;
    }
}
