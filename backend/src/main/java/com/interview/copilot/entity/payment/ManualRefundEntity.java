package com.interview.copilot.entity.payment;

public record ManualRefundEntity(
        long orderId, int refundCents, long deductSeconds, String reference, String reason) {}
