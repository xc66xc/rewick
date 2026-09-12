package com.interview.copilot.dto.wallet;

public record WalletAdjustment(
        String requestId, String operation, Long seconds, Long expectedVersion, String reason) {}
