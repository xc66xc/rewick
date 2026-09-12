package com.interview.copilot.dto.payment;

import java.time.Instant;

public record PaymentResultDTO(
        String orderId,
        String mchId,
        String appId,
        String transactionId,
        String state,
        String currency,
        int totalCents,
        Instant paidAt,
        String paymentMethod) {}
