package com.interview.copilot.validation.questions;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import org.springframework.http.HttpStatus;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/** Request bounds and output shape only; wording and meaning belong to the model. */
public final class QuestionRewritePolicy {
    public static final int MAX_QUESTION_CHARACTERS = 3000;

    private QuestionRewritePolicy() {}

    public static void request(QuestionRewriteRequest input) {
        if (input == null || input.question() == null || input.question().isBlank()
                || characters(input.question()) > 20000 || input.context() == null) throw invalid();
        if (input.context().size() > 6 || input.context().stream().anyMatch(value -> value == null
                || value.isBlank() || characters(value) > 1500)) throw invalid();
        if (input.context().stream().mapToInt(QuestionRewritePolicy::characters).sum() > 1500) throw invalid();
        if (input.resultFormat() != null && !Set.of("single", "questions-v1").contains(input.resultFormat())) throw invalid();
    }

    public static String requestId(String value) {
        try {
            if (value == null || !UUID.fromString(value).toString().equalsIgnoreCase(value)) throw invalid();
            return value.toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException error) {
            throw invalid();
        }
    }

    public static int characters(String value) {
        return value.codePointCount(0, value.length());
    }

    public static void output(JsonNode value) {
        if (value == null || !value.isObject() || value.size() > 2
                || !value.path("action").isTextual()) throw new QuestionRewriteOutputException();
        value.fieldNames().forEachRemaining(name -> {
            if (!Set.of("action", "question").contains(name)) throw new QuestionRewriteOutputException();
        });
        String action = value.path("action").asText();
        if (!Set.of("rewritten", "unchanged", "ambiguous").contains(action)) throw new QuestionRewriteOutputException();
        if (!"rewritten".equals(action)) return;
        JsonNode question = value.path("question");
        if (!question.isTextual() || question.asText().isBlank()
                || characters(question.asText()) > MAX_QUESTION_CHARACTERS) throw new QuestionRewriteOutputException();
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "QUESTION_REWRITE_INVALID", "问题改写输入格式无效或超出范围。");
    }
}
