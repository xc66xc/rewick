package com.interview.copilot.entity.mockinterview;

import java.time.LocalDateTime;

public record MockPeriodEntity(String id,String sessionId,LocalDateTime startedAt,LocalDateTime expiresAt,long usedSeconds) {}
