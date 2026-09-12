package com.interview.copilot.dto.payment;

public record PackageInputDTO(
        long version,
        String name,
        String description,
        long durationSeconds,
        int originalPriceCents,
        int discountBps,
        int sortOrder,
        boolean enabled) {}
