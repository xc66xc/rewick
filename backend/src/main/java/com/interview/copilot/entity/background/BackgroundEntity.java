package com.interview.copilot.entity.background;

import java.time.LocalDateTime;

public record BackgroundEntity(
        String id,
        String content,
        long version,
        String mutationId,
        boolean deleted,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {}
