package com.interview.copilot.dto.payment;

import java.time.Instant;

public record PaymentOrderDTO(
        String id,
        long userId,
        String packageName,
        long durationSeconds,
        int totalCents,
        Instant expiresAt) {}
