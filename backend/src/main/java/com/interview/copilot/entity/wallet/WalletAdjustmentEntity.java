package com.interview.copilot.entity.wallet;

public record WalletAdjustmentEntity(
        String operation, Long requestedSeconds, Long expectedVersion, String reason, Long actorId) {}
