package com.interview.copilot.entity.wallet;

import java.time.LocalDateTime;

public record InterviewSessionEntity(
        String id,
        long userId,
        String status,
        LocalDateTime startedAt,
        LocalDateTime expiresAt,
        LocalDateTime endedAt,
        long usedSeconds,
        String endReason) {
    public InterviewSessionEntity update(
            LocalDateTime expiry, LocalDateTime end, long used, String reason) {
        return new InterviewSessionEntity(
                id,
                userId,
                end == null ? "active" : "ended",
                startedAt,
                expiry,
                end,
                used,
                reason);
    }
}
