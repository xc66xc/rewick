package com.interview.copilot.response.wallet;

import java.time.Instant;

public record WalletTransactionResponse(
        String id,
        long deltaSeconds,
        long beforeSeconds,
        long afterSeconds,
        String reason,
        String actorDisplayName,
        String sessionId,
        Instant createdAt) {}
