package com.interview.copilot.converter.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import org.springframework.http.HttpStatus;

/** Read-only compatibility view: original text, actual sources and model input stay intact. */
public final class SessionRecordProjection {
    private SessionRecordProjection() {}

    public static void validateFormat(String format) {
        if (format != null && !"questions-v1".equals(format))
            throw new ApiException(HttpStatus.BAD_REQUEST, "RECORD_INVALID", "会话读取格式无效。");
    }

    public static JsonNode project(JsonNode content, String format) {
        validateFormat(format);
        if ("questions-v1".equals(format)) return content;
        JsonNode result = content.deepCopy();
        result.path("answers").forEach(SessionRecordProjection::answer);
        return result;
    }

    private static void answer(JsonNode node) {
        if (!(node instanceof ObjectNode answer)) return;
        if ("questions-v1".equals(answer.path("questionRewrite").path("resultFormat").asText()))
            answer.remove("questionRewrite");
        if (!(answer.path("retrieval") instanceof ObjectNode retrieval)) return;
        retrieval.remove("queries");
        retrieval.path("excerpts").forEach(excerpt -> {
            if (excerpt instanceof ObjectNode value) value.remove(java.util.List.of("excerptId", "questionIds"));
        });
    }
}
