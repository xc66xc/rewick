package com.interview.copilot.usage;

import com.interview.copilot.config.PlatformLimitsProperties;
import java.time.Clock;
import java.time.Instant;
import com.interview.copilot.wallet.WalletService;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UsageServiceTest {
    @ParameterizedTest
    @CsvSource({
            "2026-09-10T15:59:59Z,2026-09-10,2026-09-10T23:59:59",
            "2026-09-10T16:00:00Z,2026-09-11,2026-09-11T00:00:00",
            "2026-09-11T00:00:00Z,2026-09-11,2026-09-11T08:00:00"})
    void start_beijingMidnight_checksActiveInterviewAndUsesLocalLeaseExpiry(String instant, String day, String local) {
        UsageMapper mapper = mock(UsageMapper.class);
        WalletService wallet = mock(WalletService.class);
        LocalDateTime now = LocalDateTime.parse(local);
        when(mapper.lockUser(1L)).thenReturn(1L);

        var service = new UsageService(mapper, new PlatformLimitsProperties(60),
                Clock.fixed(Instant.parse(instant), ZoneOffset.UTC), wallet);

        service.start(1L, "question", "llm");

        verify(wallet).requireActive(1L);
        verify(mapper).expire(1L, now);
        verify(mapper).create(1L, "question", "llm", now.plusSeconds(600));
    }
}
