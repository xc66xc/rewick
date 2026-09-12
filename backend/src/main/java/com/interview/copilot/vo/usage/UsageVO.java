package com.interview.copilot.vo.usage;

import java.time.Instant;

public record UsageVO(
        String id,
        String userId,
        String displayName,
        String requestId,
        String capability,
        String model,
        String status,
        Instant createdAt,
        Instant finishedAt) {}
