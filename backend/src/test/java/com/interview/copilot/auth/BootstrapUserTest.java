package com.interview.copilot.auth;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class BootstrapUserTest {
    @Test
    void run_absentCredentials_doesNotCreateAccount() {
        UserMapper mapper = mock(UserMapper.class);
        var bootstrap = new BootstrapUser(new AuthProperties(24, 10, 60, "", ""), mapper,
                new BCryptPasswordEncoder(4));

        bootstrap.run(new DefaultApplicationArguments());

        verify(mapper, never()).createBootstrap(anyString(), anyString());
    }

    @Test
    void run_partialCredentials_failsWithoutAccount() {
        UserMapper mapper = mock(UserMapper.class);
        var bootstrap = new BootstrapUser(new AuthProperties(24, 10, 60, "alice", ""), mapper,
                new BCryptPasswordEncoder(4));

        assertThatThrownBy(() -> bootstrap.run(new DefaultApplicationArguments())).isInstanceOf(IllegalStateException.class);
        verify(mapper, never()).createBootstrap(anyString(), anyString());
    }
}
