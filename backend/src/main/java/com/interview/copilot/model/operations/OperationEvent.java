package com.interview.copilot.model.operations;

import java.util.Map;

public record OperationEvent(String eventId, String operationId, String spanId, String parentSpanId,
        String requestId, String sessionId, String stage, String source, String startedAt,
        Double offsetMs, double durationMs, String outcome, String reason, String serviceSource,
        String providerType, String model, String appVersion, Map<String, Object> metadata) {
    public OperationEvent {metadata=metadata==null?null:Map.copyOf(metadata);}
}
