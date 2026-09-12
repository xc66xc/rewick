package com.interview.copilot.security.email;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.interview.copilot.common.email.EmailTestData;
import com.interview.copilot.config.EmailAuthProperties;

import org.junit.jupiter.api.Test;

import java.time.Clock;

public class EmailRateLimiterTest {
    @Test
    void send_sharedAddressLimitsAcrossEmails_andResetsAfterAnHour() {
        Clock clock = mock(Clock.class);
        when(clock.millis()).thenReturn(1000L);
        var limiter =
                new EmailRateLimiter(
                        new EmailAuthProperties(true, EmailTestData.SECRET, 600, 60, 5, 5, 2, 3),
                        clock);
        limiter.send("same-ip");
        limiter.send("same-ip");

        assertThatThrownBy(() -> limiter.send("same-ip")).hasMessage("操作过于频繁，请稍后再试。");
        assertThatCode(() -> limiter.send("different-ip")).doesNotThrowAnyException();
        when(clock.millis()).thenReturn(3601000L);
        assertThatCode(() -> limiter.send("same-ip")).doesNotThrowAnyException();
    }

    @Test
    void register_separateMinuteWindow_doesNotConsumeSendingBudget() {
        Clock clock = mock(Clock.class);
        var limiter =
                new EmailRateLimiter(
                        new EmailAuthProperties(true, EmailTestData.SECRET, 600, 60, 5, 5, 1, 1),
                        clock);
        limiter.register("same-ip");
        assertThatThrownBy(() -> limiter.register("same-ip")).hasMessage("操作过于频繁，请稍后再试。");
        assertThatCode(() -> limiter.send("same-ip")).doesNotThrowAnyException();
        when(clock.millis()).thenReturn(60000L);
        assertThatCode(() -> limiter.register("same-ip")).doesNotThrowAnyException();
    }
}
