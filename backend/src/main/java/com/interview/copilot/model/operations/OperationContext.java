package com.interview.copilot.model.operations;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Explicit immutable identity; callbacks retain it across Reactor and WebSocket thread switches. */
public record OperationContext(long userId, String operationId, String spanId, String parentSpanId,
        String requestId, String sessionId, long startedNanos, String startedAt, boolean serverOnly,
        String providerType, String model, AtomicBoolean ended, Consumer<OperationEvent> sink) {
    public static OperationContext start(long user, String operation, String parent, String request,
            String session, String provider, String model, Consumer<OperationEvent> sink) {
        return new OperationContext(user, operation == null ? UUID.randomUUID().toString() : operation,
                UUID.randomUUID().toString(), parent, request, session, System.nanoTime(),
                OffsetDateTime.now(ZoneOffset.UTC).toString(), operation == null, provider, model,
                new AtomicBoolean(),sink);
    }
    public OperationContext child(String provider) {
        return new OperationContext(userId,operationId,UUID.randomUUID().toString(),spanId,requestId,sessionId,
                System.nanoTime(),OffsetDateTime.now(ZoneOffset.UTC).toString(),serverOnly,provider,model,new AtomicBoolean(),sink);
    }
    public OperationContext model(String value) {
        return new OperationContext(userId,operationId,spanId,parentSpanId,requestId,sessionId,
                startedNanos,startedAt,serverOnly,providerType,value,ended,sink);
    }
    public double elapsedMs() {return Math.max(0,(System.nanoTime()-startedNanos)/1_000_000.0);}
    public void finish(String stage,String outcome,Map<String,Object> metadata) {
        if(ended.compareAndSet(false,true)) emit(stage,outcome,metadata);
    }
    public void point(String stage,Map<String,Object> metadata) {emit(stage,"success",metadata);}
    private void emit(String stage,String outcome,Map<String,Object> metadata) {
        sink.accept(new OperationEvent(UUID.randomUUID().toString(),operationId,spanId,parentSpanId,requestId,sessionId,
                stage,"backend",startedAt,null,Math.min(86400000,elapsedMs()),outcome,
                switch(outcome) {case "timeout" -> "timeout";case "cancelled" -> "cancelled";case "rejected" -> "invalid_input";case "error" -> "provider_error";case "degraded" -> "unavailable";default -> serverOnly?"server_only":null;},"platform",providerType,model,null,metadata));
    }
}
