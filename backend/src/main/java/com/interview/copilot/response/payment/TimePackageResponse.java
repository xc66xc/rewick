package com.interview.copilot.response.payment;

public record TimePackageResponse(
        long id,
        long version,
        String name,
        String description,
        long durationSeconds,
        int originalPriceCents,
        int discountBps,
        int priceCents,
        int sortOrder,
        boolean enabled) {}
