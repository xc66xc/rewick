package com.interview.copilot.security.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.interview.copilot.config.AuthProperties;
import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;

import java.time.Clock;

public class LoginRateLimiterTest {
    @Test
    void acquire_usernameBurst_rejectsEvenAcrossAddressesThenExpires() {
        Clock clock = mock(Clock.class);
        when(clock.millis()).thenReturn(1000L);
        var limiter = new LoginRateLimiter(new AuthProperties(24, 2, 60, "", ""), clock);
        limiter.acquire("address-1", "alice");
        limiter.acquire("address-2", "alice");

        assertThatThrownBy(() -> limiter.acquire("address-3", "alice"))
                .isInstanceOf(ApiException.class);
        when(clock.millis()).thenReturn(61000L);
        assertThatCode(() -> limiter.acquire("address-3", "alice")).doesNotThrowAnyException();
    }
}
