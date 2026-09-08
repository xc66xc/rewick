package com.interview.copilot.auth;

import com.interview.copilot.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LoginRateLimiterTest {
    @Test
    void acquire_usernameBurst_rejectsEvenAcrossAddressesThenExpires() {
        Clock clock = mock(Clock.class);
        when(clock.millis()).thenReturn(1000L);
        var limiter = new LoginRateLimiter(new AuthProperties(24, 2, 60, "", ""), clock);
        limiter.acquire("address-1", "alice");
        limiter.acquire("address-2", "alice");

        assertThatThrownBy(() -> limiter.acquire("address-3", "alice")).isInstanceOf(ApiException.class);
        when(clock.millis()).thenReturn(61000L);
        assertThatCode(() -> limiter.acquire("address-3", "alice")).doesNotThrowAnyException();
    }
}
