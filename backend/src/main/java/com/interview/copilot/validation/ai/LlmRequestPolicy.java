package com.interview.copilot.validation.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderErrors;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class LlmRequestPolicy {
    private static final Set<String> FIELDS =
            Set.of("model", "messages", "stream", "temperature", "max_tokens");
    private static final Set<String> ROLES = Set.of("system", "user", "assistant");

    private LlmRequestPolicy() {}

    public static Map<String, Object> request(JsonNode input, ProviderProperties.Llm config) {
        requireFields(input, FIELDS);
        String model = input.path("model").asText(config.getModel());
        if (!config.models().contains(model)) {
            throw ProviderErrors.invalid();
        }
        Map<String, Object> result = new HashMap<>();
        result.put("model", model);
        result.put("messages", messages(input.path("messages")));
        result.put("stream", bool(input, "stream", false));
        result.put("max_tokens", tokens(input, config.getMaxOutputTokens()));
        result.put("temperature", temperature(input));
        if ("api.deepseek.com".equals(URI.create(config.getUrl()).getHost())) {
            result.put("thinking", Map.of("type", "disabled"));
        }
        if (Boolean.TRUE.equals(result.get("stream"))) {
            result.put("stream_options", Map.of("include_usage", true));
        }
        return result;
    }

    public static void requireFields(JsonNode input, Set<String> allowed) {
        if (!input.isObject()) {
            throw ProviderErrors.invalid();
        }
        input.fieldNames()
                .forEachRemaining(
                        field -> {
                            if (!allowed.contains(field)) {
                                throw ProviderErrors.invalid();
                            }
                        });
    }

    public static String requestId(String value) {
        if (value == null || value.isBlank()) {
            return UUID.randomUUID().toString();
        }
        if (!value.matches("[a-zA-Z0-9._:-]{1,128}")) {
            throw ProviderErrors.invalid();
        }
        return value;
    }

    private static List<Map<String, String>> messages(JsonNode input) {
        if (!input.isArray() || input.isEmpty() || input.size() > 40) {
            throw ProviderErrors.invalid();
        }
        List<Map<String, String>> result = new ArrayList<>();
        int total = 0;
        for (JsonNode message : input) {
            requireFields(message, Set.of("role", "content"));
            String role = message.path("role").asText("");
            JsonNode content = message.path("content");
            if (!ROLES.contains(role)
                    || !content.isTextual()
                    || content.asText().length() > 180000) {
                throw ProviderErrors.invalid();
            }
            total += content.asText().length();
            result.add(Map.of("role", role, "content", content.asText()));
        }
        if (total == 0 || total > 200000) {
            throw ProviderErrors.invalid();
        }
        return List.copyOf(result);
    }

    private static boolean bool(JsonNode input, String field, boolean fallback) {
        if (!input.has(field)) {
            return fallback;
        }
        if (!input.get(field).isBoolean()) {
            throw ProviderErrors.invalid();
        }
        return input.get(field).asBoolean();
    }

    private static int tokens(JsonNode input, int maximum) {
        if (!input.has("max_tokens")) {
            return maximum;
        }
        JsonNode value = input.get("max_tokens");
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() < 1) {
            throw ProviderErrors.invalid();
        }
        return Math.min(value.asInt(), maximum);
    }

    private static double temperature(JsonNode input) {
        if (!input.has("temperature")) {
            return 0.7;
        }
        JsonNode value = input.get("temperature");
        if (!value.isNumber() || value.asDouble() < 0 || value.asDouble() > 2) {
            throw ProviderErrors.invalid();
        }
        return value.asDouble();
    }
}
