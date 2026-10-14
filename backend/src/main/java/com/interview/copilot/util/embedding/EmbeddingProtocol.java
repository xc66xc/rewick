package com.interview.copilot.util.embedding;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderFailure;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Restricts costs and returns only verified vector values, never supplier metadata. */
public final class EmbeddingProtocol {
    private EmbeddingProtocol() {}

    public static Map<String, Object> request(
            List<String> texts, ProviderProperties.Embedding config) {
        return Map.of(
                "model",
                config.getModel(),
                "input",
                texts,
                "encoding_format",
                "float",
                "dimensions",
                config.getDimensions());
    }

    public static Map<String, Object> response(JsonNode response, int count, int dimensions) {
        if (response == null
                || !response.path("data").isArray()
                || response.path("data").size() != count) {
            throw new ProviderFailure("embedding_count", "向量响应缺少 data 数组，或返回条数与输入条数不一致。");
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<Integer> indexes = new java.util.HashSet<>();
        for (JsonNode row : response.get("data")) {
            JsonNode index = row.path("index");
            if (!index.isIntegralNumber()
                    || !index.canConvertToInt()
                    || index.asInt() < 0
                    || index.asInt() >= count
                    || !indexes.add(index.asInt())) {
                throw new ProviderFailure("embedding_index", "向量响应的 index 缺失、重复或越界。");
            }
            rows.add(
                    Map.of(
                            "index",
                            index.asInt(),
                            "embedding",
                            vector(row.path("embedding"), dimensions)));
        }
        return Map.of("data", List.copyOf(rows));
    }

    private static List<Double> vector(JsonNode value, int dimensions) {
        if (!value.isArray() || value.size() != dimensions) {
            throw new ProviderFailure("embedding_dimensions", "向量维度不匹配：要求 " + dimensions + " 维，实际 " + (value.isArray() ? value.size() : 0) + " 维。");
        }
        List<Double> vector = new ArrayList<>();
        double squaredNorm = 0;
        for (JsonNode coordinate : value) {
            if (!coordinate.isNumber() || !Float.isFinite((float) coordinate.asDouble())) {
                throw new ProviderFailure("embedding_values", "向量响应包含非数值或非有限数值。");
            }
            float component = (float) coordinate.asDouble();
            squaredNorm += (double) component * component;
            vector.add(coordinate.asDouble());
        }
        if (squaredNorm == 0) {
            throw new ProviderFailure("embedding_zero_norm", "供应商返回了无法用于检索的零向量。");
        }
        return List.copyOf(vector);
    }
}
