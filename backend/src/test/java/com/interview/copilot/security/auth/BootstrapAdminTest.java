package com.interview.copilot.security.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.interview.copilot.config.AdminBootstrapProperties;
import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.mapper.user.UserMapper;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class BootstrapAdminTest {
    private final UserMapper users = mock(UserMapper.class);
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);

    @Test
    void run_missingCredentials_doesNotCreateAdministrator() {
        bootstrap("", "").run(new DefaultApplicationArguments());

        verify(users, never()).createAdminBootstrap(anyString(), anyString());
    }

    @Test
    void run_partialCredentials_failsWithoutDefaultPassword() {
        assertThatThrownBy(() -> bootstrap("admin", "").run(new DefaultApplicationArguments()))
                .isInstanceOf(IllegalStateException.class);
        verify(users, never()).createAdminBootstrap(anyString(), anyString());
    }

    @Test
    void run_existingOrdinaryAccount_doesNotPromoteOrChangePassword() {
        when(users.findByIdentifier("admin")).thenReturn(account("USER"));

        assertThatThrownBy(
                        () ->
                                bootstrap("admin", "test-only-password")
                                        .run(new DefaultApplicationArguments()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot promote");
        verify(users, never()).createAdminBootstrap(anyString(), anyString());
    }

    @Test
    void run_existingAdministrator_doesNotOverwriteCredentials() {
        when(users.findByIdentifier("admin")).thenReturn(account("ADMIN"));

        bootstrap("admin", "test-only-password").run(new DefaultApplicationArguments());

        verify(users, never()).createAdminBootstrap(anyString(), anyString());
    }

    @Test
    void run_newAdministrator_storesBcryptHash() {
        when(users.createAdminBootstrap(eq("admin"), anyString())).thenReturn(1);
        var hash = org.mockito.ArgumentCaptor.forClass(String.class);

        bootstrap("admin", "test-only-password").run(new DefaultApplicationArguments());

        verify(users).createAdminBootstrap(eq("admin"), hash.capture());
        assertThat(passwords.matches("test-only-password", hash.getValue())).isTrue();
    }

    @Test
    void run_concurrentOrdinaryAccountCreation_doesNotPromoteIt() {
        when(users.findByIdentifier("admin")).thenReturn(null, account("USER"));

        assertThatThrownBy(
                        () ->
                                bootstrap("admin", "test-only-password")
                                        .run(new DefaultApplicationArguments()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot promote");
    }

    private BootstrapAdmin bootstrap(String displayName, String password) {
        return new BootstrapAdmin(
                new AdminBootstrapProperties(displayName, password), users, passwords);
    }

    private UserEntity account(String role) {
        UserEntity user = new UserEntity();
        user.setDisplayName("admin");
        user.setRole(role);
        return user;
    }
}
