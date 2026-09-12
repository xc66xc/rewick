package com.interview.copilot.entity.email;

import java.time.LocalDateTime;

public record EmailVerificationEntity(
        String email,
        String codeDigest,
        String nonce,
        String status,
        LocalDateTime expiresAt,
        LocalDateTime nextSendAt,
        LocalDateTime windowStartedAt,
        int sendCount,
        int failedAttempts) {
    @Override
    public String toString() {
        return "EmailVerificationEntity[redacted]";
    }
}
