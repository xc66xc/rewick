package com.interview.copilot.entity.payment;

public record TimePackageEntity(
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
