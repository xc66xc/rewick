package com.interview.copilot.common;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

/** Database timestamps are Beijing local time; API timestamps remain absolute instants. */
public final class ServerTime {
    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private ServerTime() {}

    public static LocalDateTime now(Clock clock) {
        return local(clock.instant());
    }

    public static LocalDateTime local(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZONE).truncatedTo(ChronoUnit.MICROS);
    }

    public static Instant instant(LocalDateTime localTime) {
        return localTime.atZone(ZONE).toInstant();
    }
}
