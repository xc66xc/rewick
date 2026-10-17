package com.interview.copilot.entity.mockinterview;

import java.time.LocalDateTime;

public record MockSessionEntity(String id,long userId,String requestHash,String snapshot,String config,String state,
 long version,int generation,int durationMinutes,long usedSeconds,String currentTurnId,String reportStatus,String error,
 LocalDateTime createdAt,LocalDateTime updatedAt) {}
