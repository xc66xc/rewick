package com.interview.copilot.admin.audit;

import java.time.Instant;

public record AuditView(String id, String actorId, String actorUsername, String action, String target, Instant createdAt) {}
