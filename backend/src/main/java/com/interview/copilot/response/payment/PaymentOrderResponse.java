package com.interview.copilot.response.payment;

import java.time.Instant;

public record PaymentOrderResponse(
        String id,
        long userId,
        String displayName,
        String packageName,
        long durationSeconds,
        int totalCents,
        String status,
        boolean credited,
        String codeUrl,
        Instant createdAt,
        Instant expiresAt,
        Instant paidAt,
        int refundedCents,
        long deductedSeconds) {}
