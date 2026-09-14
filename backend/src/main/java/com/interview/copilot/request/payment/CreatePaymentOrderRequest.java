package com.interview.copilot.request.payment;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.UUID;

public record CreatePaymentOrderRequest(
        @Min(1) long packageId,
        @Min(1) long packageVersion,
        @NotNull UUID requestId,
        @NotBlank @Pattern(regexp = "wechat|alipay|zpay") String paymentMethod) {}
