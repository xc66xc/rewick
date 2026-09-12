package com.interview.copilot.response.wallet;

import java.time.Instant;

public record WalletResponse(
        long availableSeconds, long version, Instant serverTime, SessionView session) {
    public record SessionView(
            String id,
            String status,
            Instant startedAt,
            Instant expiresAt,
            Instant endedAt,
            long usedSeconds,
            String endReason) {}
}
