package com.interview.copilot.util.rerank;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ai.ProviderFailure;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DashScope native text-rerank protocol; upstream document text is deliberately ignored. */
public final class BailianRerankProtocol {
    public static final String MODEL = "qwen3-rerank";
    public static final String MODEL_37 = "qwen3.7-text-rerank";
    public static final String PATH = "/api/v1/services/rerank/text-rerank/text-rerank";

    private BailianRerankProtocol() {}

    public static boolean supports(String model) {
        return MODEL.equals(model) || MODEL_37.equals(model);
    }

    public static Map<String, Object> request(String model, String query, List<String> documents) {
        if (!supports(model)) {
            throw new ProviderFailure("invalid_input", "重排序仅支持 qwen3-rerank 和 qwen3.7-text-rerank 模型。");
        }
        Map<String, Object> parameters = MODEL_37.equals(model)
                ? Map.of("top_n", documents.size())
                : Map.of("top_n", documents.size(), "return_documents", false);
        return Map.of("model", model, "input", Map.of("query", query, "documents", documents),
                "parameters", parameters);
    }

    public static List<Score> response(JsonNode response, int count) {
        JsonNode rows = response == null ? null : response.path("output").path("results");
        if (rows == null || !rows.isArray() || rows.size() != count) {
            throw invalidResponse();
        }
        Set<Integer> indexes = new HashSet<>();
        List<Score> scores = new ArrayList<>();
        for (JsonNode row : rows) {
            Score score = score(row, count);
            if (!indexes.add(score.index())) {
                throw invalidResponse();
            }
            scores.add(score);
        }
        scores.sort(Comparator.comparingDouble(Score::value).reversed().thenComparingInt(Score::index));
        return List.copyOf(scores);
    }

    private static Score score(JsonNode row, int count) {
        JsonNode index = row.path("index");
        JsonNode relevance = row.path("relevance_score");
        if (!index.isIntegralNumber() || !index.canConvertToInt() || index.intValue() < 0
                || index.intValue() >= count || !relevance.isNumber() || !Double.isFinite(relevance.doubleValue())) {
            throw invalidResponse();
        }
        return new Score(index.intValue(), relevance.doubleValue());
    }

    private static ProviderFailure invalidResponse() {
        return new ProviderFailure("protocol_error", "重排序响应必须包含所有候选的唯一有效索引和有限分数。");
    }

    public record Score(int index, double value) {}
}
