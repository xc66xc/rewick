package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import org.springframework.http.HttpStatus;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** New associations must describe evidence actually saved, never an invented combined query. */
public final class BatchRetrievalHistoryPolicy {
    private static final Set<String> STATUSES = Set.of("disabled", "ready", "empty", "degraded");
    private BatchRetrievalHistoryPolicy() {}

    public static void validate(JsonNode retrieval, JsonNode rewrite) {
        if (!retrieval.has("queries")) return;
        if (!"questions-v1".equals(rewrite.path("resultFormat").asText())
                || !"rewritten".equals(rewrite.path("status").asText())) throw invalid();
        var queries = retrieval.path("queries");
        if (!queries.isArray() || queries.isEmpty() || queries.size() > 5) throw invalid();
        if (retrieval.has("hybrid")) throw invalid();
        Set<String> questionIds = new HashSet<>();
        rewrite.path("questions").forEach(question -> questionIds.add(question.path("id").asText()));
        Map<String, Set<String>> evidence = evidence(retrieval.path("excerpts"), questionIds);
        Set<String> seen = new HashSet<>();
        for (var query : queries) {
            query.fieldNames().forEachRemaining(field -> {
                if (!Set.of("questionId", "status", "message", "hybrid", "excerptIds", "referenceStatus", "web").contains(field)) throw invalid();
            });
            String id = query.path("questionId").asText();
            if (!questionIds.contains(id) || !seen.add(id) || !STATUSES.contains(query.path("status").asText())) throw invalid();
            if (query.has("referenceStatus") && !STATUSES.contains(query.path("referenceStatus").asText())) throw invalid();
            if (query.has("message") && (!query.path("message").isTextual() || query.path("message").asText().length() > 2000)) throw invalid();
            if (query.has("web") && !Set.of("ready", "empty", "degraded").contains(query.path("web").path("status").asText())) throw invalid();
            validateAssociations(query, id, evidence);
        }
        if (!seen.equals(questionIds)) throw invalid();
    }

    private static Map<String, Set<String>> evidence(JsonNode excerpts, Set<String> questionIds) {
        if (!excerpts.isArray() || excerpts.size() > 61) throw invalid();
        Map<String, Set<String>> result = new HashMap<>();
        int references = 0;
        int web = 0;
        int summaries = 0;
        for (var excerpt : excerpts) {
            String id = text(excerpt, "excerptId", 200);
            String value = text(excerpt, "text", 2000);
            Set<String> ids = identifiers(excerpt.path("questionIds"), questionIds);
            if (result.putIfAbsent(id, ids) != null) throw invalid();
            if ("web".equals(excerpt.path("source").asText())) web += value.length();
            else references += value.length();
            if (excerpt.path("generatedSummary").asBoolean()) summaries++;
        }
        if (references > 4800 || web > 8000 || summaries > questionIds.size()) throw invalid();
        return result;
    }

    private static void validateAssociations(JsonNode query, String questionId, Map<String, Set<String>> evidence) {
        if (!query.path("excerptIds").isArray() || query.path("excerptIds").size() > 61) throw invalid();
        Set<String> ids = new HashSet<>();
        for (var id : query.path("excerptIds")) {
            if (!id.isTextual() || !ids.add(id.asText()) || !evidence.containsKey(id.asText())
                    || !evidence.get(id.asText()).contains(questionId)) throw invalid();
        }
        evidence.forEach((id, questions) -> { if (questions.contains(questionId) && !ids.contains(id)) throw invalid(); });
    }

    private static Set<String> identifiers(JsonNode nodes, Set<String> allowed) {
        if (!nodes.isArray() || nodes.isEmpty() || nodes.size() > 5) throw invalid();
        Set<String> values = new HashSet<>();
        for (var node : nodes) {
            if (!node.isTextual() || !allowed.contains(node.asText()) || !values.add(node.asText())) throw invalid();
        }
        return values;
    }

    private static String text(JsonNode node, String key, int maximum) {
        if (!node.path(key).isTextual() || node.path(key).asText().isBlank() || node.path(key).asText().length() > maximum) throw invalid();
        return node.path(key).asText();
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "RECORD_INVALID", "会话分题检索证据关联格式无效。");
    }
}
