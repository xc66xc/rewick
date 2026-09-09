package com.interview.copilot.admin.audit;

import java.time.Instant;

public record AuditView(String id, String actorId, String actorDisplayName, String action, String target, Instant createdAt) {}
