package com.interview.copilot.request.payment;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PackageRequest(
        long version,
        @NotBlank @Size(max = 100) String name,
        @Size(max = 1000) String description,
        @Min(1) @Max(315360000) long durationSeconds,
        @Min(1) @Max(100000000) int originalPriceCents,
        @Min(1) @Max(10000) int discountBps,
        int sortOrder,
        boolean enabled) {}
