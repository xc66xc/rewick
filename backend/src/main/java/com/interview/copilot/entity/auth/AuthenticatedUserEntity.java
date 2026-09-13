package com.interview.copilot.entity.auth;

import java.time.LocalDateTime;

public record AuthenticatedUserEntity(
        long id,
        String displayName,
        String role,
        String email,
        long tokenId,
        String clientType,
        boolean revoked,
        String revokedReason,
        boolean enabled,
        LocalDateTime expiresAt) {}
