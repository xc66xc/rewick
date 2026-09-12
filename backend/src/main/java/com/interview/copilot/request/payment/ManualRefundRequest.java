package com.interview.copilot.request.payment;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ManualRefundRequest(
        @NotNull UUID requestId,
        @Min(1) int refundCents,
        @Min(0) long deductSeconds,
        @NotBlank @Size(max = 200) String reference,
        @NotBlank @Size(max = 500) String reason) {}
