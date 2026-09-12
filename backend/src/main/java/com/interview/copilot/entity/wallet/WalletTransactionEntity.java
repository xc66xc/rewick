package com.interview.copilot.entity.wallet;

import java.time.LocalDateTime;

public record WalletTransactionEntity(
        String id,
        long deltaSeconds,
        long beforeSeconds,
        long afterSeconds,
        String reason,
        String actorDisplayName,
        String sessionId,
        LocalDateTime createdAt) {}
