package com.interview.copilot.dto.payment;

public record ManualRefundDTO(
        String requestId, int refundCents, long deductSeconds, String reference, String reason) {}
