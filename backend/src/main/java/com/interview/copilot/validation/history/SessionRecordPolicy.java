package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.validation.background.JobExperiencePolicy;

import org.springframework.http.HttpStatus;

import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.OffsetDateTime;
import java.util.Set;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 校验会话记录和历史面试信息
 */
public final class SessionRecordPolicy {
    private static final Set<String> FIELDS =
            Set.of(
                    "id",
                    "title",
                    "createdAt",
                    "segments",
                    "answers",
                    "interviewEnvironment",
                    "interviewSessionId");
    private static final Set<String> SECRETS =
            Set.of("password", "apikey", "accesstoken", "authorization", "secret", "token");

    private SessionRecordPolicy() {}

    public static void validate(String id, JsonNode content) {
        if (!content.isObject()
                || id.isBlank()
                || id.length() > 128
                || !id.equals(content.path("id").asText())) throw invalid();
        content.fieldNames()
                .forEachRemaining(
                        key -> {
                            if (!FIELDS.contains(key)) throw invalid();
                        });
        text(content, "title", 200);
        time(content.path("createdAt").asText());
        array(content.path("segments"), 10000);
        array(content.path("answers"), 500);
        content.path("segments").forEach(SessionRecordPolicy::segment);
        content.path("answers").forEach(SessionRecordPolicy::answer);
        environment(content.path("interviewEnvironment"));
        if (content.toString().getBytes(StandardCharsets.UTF_8).length > 4 * 1048576)
            throw invalid();
        rejectSecrets(content);
    }

    private static void segment(JsonNode node) {
        text(node, "id", 160);
        if (!node.path("text").isTextual()
                || node.path("text").asText().length() > 20000
                || !node.path("startMs").isNumber()
                || node.path("startMs").asDouble() < 0
                || !node.path("isFinal").isBoolean()) throw invalid();
        if (node.has("endMs")
                && (!node.path("endMs").isNumber()
                        || node.path("endMs").asDouble() < node.path("startMs").asDouble()))
            throw invalid();
    }

    private static void answer(JsonNode node) {
        text(node, "id", 128);
        if (!node.path("question").isTextual()
                || node.path("question").asText().length() > 20000
                || !node.path("text").isTextual()
                || node.path("text").asText().length() > 100000) throw invalid();
        if (!Set.of("streaming", "complete", "cancelled", "error")
                .contains(node.path("status").asText())) throw invalid();
        time(node.path("createdAt").asText());
        environment(node.path("interviewEnvironment"));
    }

    private static void environment(JsonNode node) {
        if (!JobExperiencePolicy.isValid(node.get(JobExperiencePolicy.FIELD))) throw invalid();
        if (node.has("interviewType")
                && (!node.path("interviewType").isTextual()
                        || !Set.of("technical", "general").contains(node.path("interviewType").asText()))) {
            throw invalid();
        }
    }

    private static void rejectSecrets(JsonNode node) {
        if (node.isObject())
            node.fieldNames()
                    .forEachRemaining(
                            key -> {
                                if (SECRETS.contains(
                                        key.replace("_", "").toLowerCase(java.util.Locale.ROOT)))
                                    throw invalid();
                            });
        if (node.isContainerNode()) node.forEach(SessionRecordPolicy::rejectSecrets);
    }

    private static void array(JsonNode node, int max) {
        if (!node.isArray() || node.size() > max) throw invalid();
    }

    private static void text(JsonNode node, String key, int max) {
        if (!node.path(key).isTextual()
                || node.path(key).asText().isBlank()
                || node.path(key).asText().length() > max) throw invalid();
    }

    private static void time(String value) {
        try {
            OffsetDateTime.parse(value);
        } catch (DateTimeException error) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(
                HttpStatus.BAD_REQUEST, "RECORD_INVALID", "会话格式无效、含敏感配置字段或超过 4 MiB。");
    }
}
