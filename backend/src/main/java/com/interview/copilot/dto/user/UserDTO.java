package com.interview.copilot.dto.user;

import java.time.Instant;

public record UserDTO(
        String id,
        String displayName,
        String role,
        boolean enabled,
        long availableSeconds,
        long walletVersion,
        Instant createdAt) {}
