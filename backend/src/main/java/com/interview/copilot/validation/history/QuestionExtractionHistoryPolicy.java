package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.validation.questions.QuestionExtractionPolicy;
import org.springframework.http.HttpStatus;
import java.util.Set;

public final class QuestionExtractionHistoryPolicy {
    private QuestionExtractionHistoryPolicy() {}

    public static void validate(JsonNode rewrite) {
        if (!rewrite.isObject() || !"questions-v1".equals(rewrite.path("resultFormat").asText())) throw invalid();
        rewrite.fieldNames().forEachRemaining(key -> {
            if (!Set.of("resultFormat", "status", "questions", "reason", "model", "durationMs", "platformVersion").contains(key)) throw invalid();
        });
        String status = rewrite.path("status").asText();
        if (!Set.of("rewritten", "unchanged", "skipped", "degraded").contains(status)) throw invalid();
        if (!rewrite.path("questions").isArray() || rewrite.path("questions").size() > 5) throw invalid();
        if (!"rewritten".equals(status)) {
            if (!rewrite.path("questions").isEmpty()) throw invalid();
            return;
        }
        int index = 1;
        for (var question : rewrite.path("questions")) {
            if (!question.path("id").isTextual() || !("q" + index++).equals(question.path("id").asText())) throw invalid();
        }
        try {
            QuestionExtractionPolicy.questions(rewrite.path("questions"));
        } catch (QuestionRewriteOutputException error) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "RECORD_INVALID", "会话问题提取快照格式无效。");
    }
}
