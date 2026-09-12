package com.interview.copilot.entity.history;

public record SessionRecordEntity(
        long id,
        String recordId,
        long version,
        String mutationId,
        String content,
        boolean deleted) {}
