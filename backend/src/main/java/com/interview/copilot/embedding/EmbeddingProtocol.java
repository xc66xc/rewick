package com.interview.copilot.embedding;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.ai.LlmRequestPolicy;
import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Restricts costs and returns only verified vector values, never supplier metadata. */
public final class EmbeddingProtocol {
    private EmbeddingProtocol() { }

    public static List<String> input(JsonNode body) {
        LlmRequestPolicy.requireFields(body, Set.of("serviceId", "model", "dimensions", "encoding_format", "input"));
        if (!body.path("serviceId").isTextual()
                || !body.path("serviceId").asText().matches("[A-Za-z0-9_.-]{1,64}")) { throw ProviderErrors.invalid(); }
        JsonNode input = body.path("input");
        List<String> texts = new ArrayList<>();
        if (input.isTextual()) { texts.add(input.asText()); }
        else if (input.isArray()) {
            for (JsonNode text : input) {
                if (!text.isTextual()) { throw ProviderErrors.invalid(); }
                texts.add(text.asText());
            }
        } else { throw ProviderErrors.invalid(); }
        validateTexts(texts);
        return List.copyOf(texts);
    }

    private static void validateTexts(List<String> texts) {
        if (texts.isEmpty() || texts.size() > 10) { throw ProviderErrors.invalid(); }
        int total = 0;
        for (String text : texts) {
            if (text.isBlank() || text.length() > 20000) { throw ProviderErrors.invalid(); }
            total += text.length();
        }
        if (total > 200000) { throw ProviderErrors.invalid(); }
    }

    public static void validateSelection(JsonNode body, ProviderProperties.Embedding config) {
        if (body.has("model") && (!body.get("model").isTextual()
                || !body.get("model").asText().equals(config.getModel()))) { throw ProviderErrors.invalid(); }
        if (body.has("dimensions") && (!body.get("dimensions").isIntegralNumber() || !body.get("dimensions").canConvertToInt()
                || body.get("dimensions").asInt() != config.getDimensions())) { throw ProviderErrors.invalid(); }
        if (body.has("encoding_format") && !"float".equals(body.get("encoding_format").asText())) {
            throw ProviderErrors.invalid();
        }
    }

    public static Map<String, Object> request(List<String> texts, ProviderProperties.Embedding config) {
        return Map.of("model", config.getModel(), "input", texts, "encoding_format", "float", "dimensions", config.getDimensions());
    }

    public static Map<String, Object> response(JsonNode response, int count, int dimensions) {
        if (response == null || !response.path("data").isArray() || response.path("data").size() != count) {
            throw ProviderErrors.failed();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<Integer> indexes = new java.util.HashSet<>();
        for (JsonNode row : response.get("data")) {
            JsonNode index = row.path("index");
            if (!index.isIntegralNumber() || !index.canConvertToInt() || index.asInt() < 0
                    || index.asInt() >= count || !indexes.add(index.asInt())) { throw ProviderErrors.failed(); }
            rows.add(Map.of("index", index.asInt(), "embedding", vector(row.path("embedding"), dimensions)));
        }
        return Map.of("data", List.copyOf(rows));
    }

    private static List<Double> vector(JsonNode value, int dimensions) {
        if (!value.isArray() || value.size() != dimensions) { throw ProviderErrors.failed(); }
        List<Double> vector = new ArrayList<>();
        double squaredNorm = 0;
        for (JsonNode coordinate : value) {
            if (!coordinate.isNumber() || !Float.isFinite((float) coordinate.asDouble())) { throw ProviderErrors.failed(); }
            float component = (float) coordinate.asDouble();
            squaredNorm += (double) component * component;
            vector.add(coordinate.asDouble());
        }
        if (squaredNorm == 0) { throw ProviderErrors.failed(); }
        return List.copyOf(vector);
    }
}
