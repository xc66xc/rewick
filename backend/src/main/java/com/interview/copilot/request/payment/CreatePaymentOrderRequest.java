package com.interview.copilot.request.payment;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record CreatePaymentOrderRequest(
        @Min(1) long packageId, @Min(1) long packageVersion, @NotNull UUID requestId) {}
