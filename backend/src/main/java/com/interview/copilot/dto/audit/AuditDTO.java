package com.interview.copilot.dto.audit;

import java.time.Instant;

public record AuditDTO(
        String id,
        String actorId,
        String actorDisplayName,
        String action,
        String target,
        Instant createdAt) {}
