package com.interview.copilot.util.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.validation.ai.LlmRequestPolicy;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public final class AsrProtocol {
    private AsrProtocol() {}

    public static String taskId(JsonNode frame) {
        LlmRequestPolicy.requireFields(frame, Set.of("header", "payload"));
        LlmRequestPolicy.requireFields(
                frame.path("header"), Set.of("action", "task_id", "streaming"));
        if (!"duplex".equals(frame.path("header").path("streaming").asText())) {
            throw ProviderErrors.invalid();
        }
        String taskId = frame.path("header").path("task_id").asText("");
        if (!taskId.matches("[A-Za-z0-9._:-]{1,128}")) {
            throw ProviderErrors.invalid();
        }
        return taskId;
    }

    public static Map<String, Object> run(JsonNode frame, String upstreamId, String model) {
        JsonNode payload = frame.path("payload");
        LlmRequestPolicy.requireFields(
                payload, Set.of("task_group", "task", "function", "model", "parameters", "input"));
        JsonNode parameters = payload.path("parameters");
        LlmRequestPolicy.requireFields(
                parameters,
                Set.of(
                        "format",
                        "sample_rate",
                        "semantic_punctuation_enabled",
                        "max_sentence_silence",
                        "heartbeat"));
        if (!"pcm".equals(parameters.path("format").asText())
                || !parameters.path("sample_rate").isIntegralNumber()
                || parameters.path("sample_rate").asInt() != 16000) {
            throw ProviderErrors.invalid();
        }
        if (!payload.path("input").isObject() || !payload.path("input").isEmpty()) {
            throw ProviderErrors.invalid();
        }
        int silence = Math.clamp(parameters.path("max_sentence_silence").asInt(800), 200, 2000);
        return Map.of(
                "header",
                header("action", "run-task", upstreamId),
                "payload",
                Map.of(
                        "task_group",
                        "audio",
                        "task",
                        "asr",
                        "function",
                        "recognition",
                        "model",
                        model,
                        "parameters",
                        Map.of(
                                "format",
                                "pcm",
                                "sample_rate",
                                16000,
                                "semantic_punctuation_enabled",
                                false,
                                "max_sentence_silence",
                                silence,
                                "heartbeat",
                                true),
                        "input",
                        Map.of()));
    }

    public static Map<String, Object> finish(String upstreamId) {
        return Map.of(
                "header",
                header("action", "finish-task", upstreamId),
                "payload",
                Map.of("input", Map.of()));
    }

    public static Map<String, Object> event(JsonNode input, String clientId) {
        String event = input.path("header").path("event").asText("");
        if (!Set.of("task-started", "task-finished", "result-generated").contains(event)) {
            throw ProviderErrors.failed();
        }
        Map<String, Object> result = new HashMap<>();
        result.put("header", Map.of("task_id", clientId, "event", event));
        if ("result-generated".equals(event)) {
            result.put("payload", Map.of("output", Map.of("sentence", sentence(input))));
        } else {
            result.put("payload", Map.of());
        }
        return result;
    }

    public static Map<String, Object> failure(String clientId) {
        return Map.of(
                "header",
                Map.of(
                        "task_id",
                        clientId,
                        "event",
                        "task-failed",
                        "error_code",
                        "PLATFORM_ASR_ERROR"),
                "payload",
                Map.of("message", "语音服务中断，请重新开始"));
    }

    private static Map<String, Object> header(String kind, String value, String taskId) {
        return Map.of(kind, value, "task_id", taskId, "streaming", "duplex");
    }

    private static Map<String, Object> sentence(JsonNode frame) {
        JsonNode input = frame.path("payload").path("output").path("sentence");
        if (!input.isObject()) {
            throw ProviderErrors.failed();
        }
        Map<String, Object> result = new HashMap<>();
        for (String field : Set.of("heartbeat", "sentence_end")) {
            if (input.path(field).isBoolean()) {
                result.put(field, input.get(field).asBoolean());
            }
        }
        for (String field : Set.of("begin_time", "end_time")) {
            if (input.path(field).isIntegralNumber()
                    && input.get(field).canConvertToLong()
                    && input.get(field).asLong() >= 0) {
                result.put(field, input.get(field).asLong());
            }
        }
        if (input.path("text").isTextual()) {
            String text = input.get("text").asText();
            if (text.length() > 10000) {
                throw ProviderErrors.failed();
            }
            result.put("text", text);
        }
        return result;
    }
}
