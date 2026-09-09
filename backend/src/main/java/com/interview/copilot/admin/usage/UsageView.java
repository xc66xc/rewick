package com.interview.copilot.admin.usage;

import java.time.Instant;

public record UsageView(String id, String userId, String displayName, String requestId, String capability,
        String model, String status, Instant createdAt, Instant finishedAt) {}
