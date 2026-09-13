package com.interview.copilot.vo.user;

import java.time.Instant;

public record UserVO(
        String id,
        String displayName,
        String email,
        String role,
        boolean enabled,
        long availableSeconds,
        long walletVersion,
        Instant createdAt) {}
