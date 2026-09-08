package com.interview.copilot.admin.users;

import java.time.Instant;

public record UserView(String id, String username, String role, boolean enabled,
        int dailyAnswers, int dailyKnowledgeQueries, Instant createdAt) {}
