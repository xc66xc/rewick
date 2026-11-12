package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.validation.background.JobExperiencePolicy;
import com.interview.copilot.validation.background.InterviewTypePolicy;

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

    public static void validate(String id, JsonNode content, int maxMiB) {
        validateStructure(id, content);
        validateSize(content, maxMiB);
    }

    public static void validateStructure(String id, JsonNode content) {
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
        rejectSecrets(content);
    }

    public static void validateSize(JsonNode content, int maxMiB) {
        if (maxMiB < 1 || maxMiB > 50) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SESSION_RECORD_LIMIT_UNAVAILABLE",
                    "会话容量配置无效，请联系管理员。");
        }
        if (content.toString().getBytes(StandardCharsets.UTF_8).length > (long) maxMiB * 1048576) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SESSION_RECORD_TOO_LARGE",
                    "单次会话超过 " + maxMiB + " MiB，请新建会话。");
        }
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
        if (node.has("algorithmRootId") && (!node.path("algorithmRootId").isTextual() || node.path("algorithmRootId").asText().isBlank() || node.path("algorithmRootId").asText().length() > 128)) throw invalid();
        if (node.has("mode") && (!node.path("mode").isTextual() || !"algorithm".equals(node.path("mode").asText()))) throw invalid();
        if (node.has("language") && (!node.path("language").isTextual()
                || !Set.of("Java", "Python", "C++", "TypeScript").contains(node.path("language").asText()))) throw invalid();
        questionRewrite(node.path("questionRewrite"));
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

    private static void questionRewrite(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) return;
        if (!node.isObject() || !Set.of("rewritten", "unchanged", "skipped", "degraded").contains(node.path("status").asText())) throw invalid();
        node.fieldNames().forEachRemaining(name -> {
            if (!Set.of("status", "question", "reason", "model", "durationMs", "platformVersion").contains(name)) throw invalid();
        });
        if (!node.path("durationMs").isNumber() || !Double.isFinite(node.path("durationMs").asDouble())
                || node.path("durationMs").asDouble() < 0 || node.path("durationMs").asDouble() > 60000
                || !node.path("platformVersion").isIntegralNumber() || !node.path("platformVersion").canConvertToLong()
                || node.path("platformVersion").asLong() < 0) throw invalid();
        if ("rewritten".equals(node.path("status").asText())) {
            text(node, "question", 6000);
            if (com.interview.copilot.validation.questions.QuestionRewritePolicy.characters(node.path("question").asText()) > 3000) throw invalid();
        } else if (!node.path("question").isNull()) throw invalid();
        if (!node.path("model").isNull() && (!node.path("model").isTextual()
                || node.path("model").asText().isBlank() || node.path("model").asText().length() > 200)) throw invalid();
        if (!node.path("reason").isNull() && !Set.of("disabled", "unchanged", "ambiguous", "input_limit", "timeout",
                "busy", "invalid_output", "provider_error", "network_error", "unavailable").contains(node.path("reason").asText())) throw invalid();
    }

    private static void environment(JsonNode node) {
        if (!JobExperiencePolicy.isValid(node.get(JobExperiencePolicy.FIELD))) throw invalid();
        if (node.has("interviewType")
                && !InterviewTypePolicy.isValid(node.path("interviewType"))) {
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
                HttpStatus.BAD_REQUEST, "RECORD_INVALID", "会话格式无效或含敏感配置字段。");
    }
}
