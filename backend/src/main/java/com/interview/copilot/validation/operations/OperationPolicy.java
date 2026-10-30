package com.interview.copilot.validation.operations;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.model.operations.OperationsSettings;
import org.springframework.http.HttpStatus;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

public final class OperationPolicy {
    public static final Set<String> STAGES = Set.of("answer.auto_wait", "answer.complete", "answer.prepare", "retrieval.rag",
            "retrieval.bm25", "retrieval.vector", "retrieval.fusion", "retrieval.parent_lookup", "retrieval.context_pack", "retrieval.web", "retrieval.join", "retrieval.embedding", "retrieval.database", "llm.first_content",
            "llm.complete", "answer.first_render", "session.save", "session.sync", "asr.connect",
            "asr.first_transcript", "asr.complete", "asr.backlog", "auto.feedback");
    public static final Set<String> OUTCOMES = Set.of("success", "error", "timeout", "cancelled",
            "rejected", "degraded", "empty", "skipped");
    private static final Set<String> FIELDS = Set.of("eventId", "operationId", "spanId", "parentSpanId",
            "requestId", "sessionId", "stage", "source", "startedAt", "offsetMs", "durationMs",
            "outcome", "reason", "serviceSource", "providerType", "model", "appVersion", "metadata");
    private static final Set<String> METADATA = Set.of("candidateCount", "cacheHits", "fragmentCount", "inputTokens", "outputTokens",
            "totalTokens", "bufferedBytes", "maxGapMs", "summaryEnabled", "audioBytes", "filteredCount", "triggerCount");
    private static final Set<String> REASONS = Set.of("provider_error", "network_error", "timeout", "cancelled",
            "unauthorized", "unavailable", "rate_limit", "session_inactive", "invalid_input", "storage_error",
            "queue_full", "empty", "feedback", "server_only", "unknown");
    private OperationPolicy() {}
    public static String uuid(String value) {
        if (value == null) return null;
        try {
            if (!UUID.fromString(value).toString().equalsIgnoreCase(value)) throw invalid();
            return value.toLowerCase(java.util.Locale.ROOT);
        } catch (IllegalArgumentException error) { throw invalid(); }
    }
    public static void fields(JsonNode node) {
        if (!node.isObject() || !node.has("durationMs") || !node.path("durationMs").isNumber()) throw invalid();
        node.fieldNames().forEachRemaining(name -> { if (!FIELDS.contains(name)) throw invalid(); });
    }
    public static void event(OperationEvent event) {
        if (event == null || uuid(event.eventId()) == null || uuid(event.operationId()) == null
                || uuid(event.spanId()) == null) throw invalid();
        uuid(event.parentSpanId());
        if (event.stage()==null || event.outcome()==null || event.source()==null || event.providerType()==null
                || !STAGES.contains(event.stage()) || !OUTCOMES.contains(event.outcome())
                || !Set.of("desktop", "backend").contains(event.source())
                || !Set.of("llm", "pg", "tavily", "deepseek", "asr", "system").contains(event.providerType())) throw invalid();
        if (!Double.isFinite(event.durationMs()) || event.durationMs() < 0 || event.durationMs() > 86400000) throw invalid();
        if (event.offsetMs() != null && (!Double.isFinite(event.offsetMs()) || event.offsetMs() < 0 || event.offsetMs() > 86400000)) throw invalid();
        bounded(event.requestId(), 128); bounded(event.sessionId(), 128); bounded(event.model(), 200); bounded(event.appVersion(), 32);
        if (event.reason() != null && !REASONS.contains(event.reason())) throw invalid();
        if (event.serviceSource() != null && !Set.of("platform", "custom").contains(event.serviceSource())) throw invalid();
        try {
            var at = OffsetDateTime.parse(event.startedAt());
            if (at.toInstant().isAfter(java.time.Instant.now().plusSeconds(300))
                    || at.toInstant().isBefore(java.time.Instant.now().minusSeconds(604800))) throw invalid();
        } catch (java.time.format.DateTimeParseException | NullPointerException error) { throw invalid(); }
        metadata(event);
    }
    private static void bounded(String value, int size) {
        if (value != null && (value.length() > size || value.chars().anyMatch(Character::isISOControl))) throw invalid();
    }
    private static void metadata(OperationEvent event) {
        if (event.metadata() == null) return;
        event.metadata().forEach((key, value) -> {
            if (!METADATA.contains(key)) throw invalid();
            if ("summaryEnabled".equals(key)) { if (!(value instanceof Boolean)) throw invalid(); }
            else if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())
                    || number.doubleValue() < 0 || number.doubleValue() > 1e12
                    || (!"maxGapMs".equals(key) && Math.rint(number.doubleValue()) != number.doubleValue())) throw invalid();
        });
    }
    public static void settings(OperationsSettings settings) {
        if (settings == null || settings.version() < 0 || settings.allowedUserIds().size() > 1000) throw invalid();
        settings.allowedUserIds().forEach(id -> { if (!id.matches("[1-9][0-9]{0,17}")) throw invalid(); });
        var t = settings.thresholds();
        if (!Double.isFinite(t.firstContentP95Ms()) || t.firstContentP95Ms() < 1 || t.firstContentP95Ms() > 86400000
                || !rate(t.errorRate()) || !rate(t.degradedRate()) || !rate(t.connectionUtilization())
                || t.minSamples() < 20 || t.minSamples() > 10000 || t.sustainSeconds() < 300 || t.sustainSeconds() > 86400) throw invalid();
    }
    private static boolean rate(double value) { return Double.isFinite(value) && value > 0 && value <= 1; }
    public static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_OPERATION_INPUT", "观测字段格式无效或超出范围。");
    }
}
