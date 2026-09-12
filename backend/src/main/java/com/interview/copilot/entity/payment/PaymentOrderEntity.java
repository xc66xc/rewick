package com.interview.copilot.entity.payment;

import java.time.LocalDateTime;

public record PaymentOrderEntity(
        long databaseId,
        String id,
        long userId,
        String displayName,
        long packageId,
        long packageVersion,
        String packageName,
        long durationSeconds,
        int totalCents,
        long configVersion,
        String status,
        boolean credited,
        String codeUrl,
        String transactionId,
        LocalDateTime createdAt,
        LocalDateTime expiresAt,
        LocalDateTime paidAt,
        int refundedCents,
        long deductedSeconds) {}
