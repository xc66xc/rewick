package com.interview.copilot.entity.operations;

public record OperationsEventRow(String eventId, String operationId, long userId,
        String stage, String source, String providerType, String outcome, double durationMs,
        String model, String appVersion, String sessionId, String startedAt,
        String payload, boolean serverOnly, boolean tokenSample) {}
