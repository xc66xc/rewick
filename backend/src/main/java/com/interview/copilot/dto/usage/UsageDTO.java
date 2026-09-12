package com.interview.copilot.dto.usage;

import java.time.Instant;

public record UsageDTO(
        String id,
        String userId,
        String displayName,
        String requestId,
        String capability,
        String model,
        String status,
        Instant createdAt,
        Instant finishedAt) {}
