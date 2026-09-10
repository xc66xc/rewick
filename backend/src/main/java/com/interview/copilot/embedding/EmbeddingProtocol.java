package com.interview.copilot.embedding;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Restricts costs and returns only verified vector values, never supplier metadata. */
public final class EmbeddingProtocol {
    private EmbeddingProtocol() { }

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
