package com.interview.copilot.entity.user;

import java.time.Instant;

public record AdminUserEntity(
        String id,
        String displayName,
        String email,
        String role,
        boolean enabled,
        long availableSeconds,
        long walletVersion,
        Instant createdAt) {}
