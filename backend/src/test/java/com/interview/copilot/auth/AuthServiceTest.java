package com.interview.copilot.auth;

import com.interview.copilot.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
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

class AuthServiceTest {
    private final UserMapper users = mock(UserMapper.class);
    private final TokenMapper tokens = mock(TokenMapper.class);
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    private final Instant now = Instant.parse("2026-09-08T00:00:00Z");
    private AuthService service;

    @BeforeEach
    void setUp() {
        service = new AuthService(users, tokens, passwords, new AuthProperties(24, 10, 60, "", ""),
                Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void login_validCredentials_storesOnlyHashWithExpiry() {
        when(users.findForLogin("alice")).thenReturn(user("alice", true));

        var result = service.login("alice", "a-test-password");

        ArgumentCaptor<String> stored = ArgumentCaptor.forClass(String.class);
        verify(tokens).create(eq(7L), stored.capture(), eq(now.plusSeconds(86400)));
        assertThat(stored.getValue()).hasSize(64).isNotEqualTo(result.accessToken());
        assertThat(result.accessToken()).matches("[A-Za-z0-9_-]{43}");
        assertThat(result.user().id()).isEqualTo("7");
        assertThat(result.toString()).doesNotContain(result.accessToken());
    }

    @Test
    void login_wrongPassword_doesNotIssueToken() {
        when(users.findForLogin("alice")).thenReturn(user("alice", true));

        assertThatThrownBy(() -> service.login("alice", "wrong-password"))
                .isInstanceOf(ApiException.class).hasMessage("用户名或密码不正确。");
        verify(tokens, never()).create(anyLong(), anyString(), any());
    }

    @Test
    void login_disabledUser_rejectsCorrectPassword() {
        when(users.findForLogin("alice")).thenReturn(user("alice", false));

        assertThatThrownBy(() -> service.login("alice", "a-test-password")).isInstanceOf(ApiException.class);
        verify(tokens, never()).create(anyLong(), anyString(), any());
    }

    @Test
    void login_missingUser_usesSameSafeError() {
        assertThatThrownBy(() -> service.login("missing", "a-test-password"))
                .isInstanceOf(ApiException.class).hasMessage("用户名或密码不正确。");
    }

    @Test
    void authenticate_malformedToken_doesNotQueryStorage() {
        assertThat(service.authenticate("not-an-opaque-token")).isEmpty();
        verify(tokens, never()).authenticate(any(), any());
    }

    @Test
    void logout_opaqueToken_revokesItsHash() {
        String token = TokenSecrets.create();

        service.logout(token);

        verify(tokens).revoke(TokenSecrets.hash(token));
    }

    private UserEntity user(String username, boolean enabled) {
        UserEntity user = new UserEntity();
        user.setId(7L);
        user.setUsername(username);
        user.setPasswordHash(passwords.encode("a-test-password"));
        user.setEnabled(enabled);
        return user;
    }
}
