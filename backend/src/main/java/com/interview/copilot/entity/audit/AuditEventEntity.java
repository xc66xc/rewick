package com.interview.copilot.entity.audit;

import java.time.Instant;

public record AuditEventEntity(
        String id,
        String actorId,
        String actorDisplayName,
        String action,
        String target,
        Instant createdAt) {}
