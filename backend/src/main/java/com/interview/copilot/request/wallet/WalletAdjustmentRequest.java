package com.interview.copilot.request.wallet;

public record WalletAdjustmentRequest(
        String requestId, String operation, Long seconds, Long expectedVersion, String reason) {}
