package com.interview.copilot.response.wallet;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;

public record WalletResponse(
        long availableSeconds,
        long version,
        Instant serverTime,
        SessionView session,
        JsonNode background) {
    public WalletResponse(
            long availableSeconds, long version, Instant serverTime, SessionView session) {
        this(availableSeconds, version, serverTime, session, null);
    }

    public record SessionView(
            String id,
            String status,
            Instant startedAt,
            Instant expiresAt,
            Instant endedAt,
            long usedSeconds,
            String endReason) {}
}
