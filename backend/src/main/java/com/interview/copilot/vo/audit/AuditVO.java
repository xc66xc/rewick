package com.interview.copilot.vo.audit;

import java.time.Instant;

public record AuditVO(
        String id,
        String actorId,
        String actorDisplayName,
        String action,
        String target,
        Instant createdAt) {}
