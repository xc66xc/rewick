package com.interview.copilot.util.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.validation.ai.LlmThinkingPolicy;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import reactor.core.publisher.Mono;

/** Bounded SSE-to-completion adapter; reasoning deltas are deliberately never accumulated. */
public final class ProviderCompletions {
    private ProviderCompletions() {}

    public static Mono<JsonNode> complete(ProviderHttpClient http, ProviderJson json,
            ProviderProperties.Llm endpoint, Map<String, Object> body, Duration timeout) {
        return LlmThinkingPolicy.requiresStreaming(endpoint)
                ? collect(http, json, endpoint, body, timeout, false)
                : http.json(endpoint, body, timeout);
    }

    public static Mono<JsonNode> probe(ProviderHttpClient http, ProviderJson json,
            ProviderProperties.Llm endpoint, Map<String, Object> body, Duration timeout) {
        return LlmThinkingPolicy.requiresStreaming(endpoint)
                ? collect(http, json, endpoint, body, timeout, true)
                : http.json(endpoint, body, timeout);
    }

    private static Mono<JsonNode> collect(ProviderHttpClient http, ProviderJson json,
            ProviderProperties.Llm endpoint, Map<String, Object> body, Duration timeout, boolean firstContent) {
        return Mono.defer(() -> {
            Map<String, Object> streaming = new HashMap<>(body);
            streaming.put("stream", true);
            streaming.put("stream_options", Map.of("include_usage", true));
            var state = new CompletionState(json, firstContent);
            return http.stream(endpoint, streaming).takeUntil(event -> state.accept(event.data()))
                    .then(Mono.fromSupplier(state::result)).timeout(timeout)
                    .onErrorMap(ProviderFailureClassifier::classify);
        });
    }

    private static final class CompletionState {
        private final ProviderJson json;
        private final boolean firstContent;
        private final StringBuilder content = new StringBuilder();
        private Object usage;
        private String finish = "";
        private boolean done;

        private CompletionState(ProviderJson json, boolean firstContent) {
            this.json = json;
            this.firstContent = firstContent;
        }

        private boolean accept(String data) {
            if (data == null || data.isBlank()) return false;
            if ("[DONE]".equals(data.trim())) { done = true; return true; }
            JsonNode value = json.parse(data);
            if (value.has("error")) throw new ProviderFailure("stream_error", "供应商流式响应失败，请检查模型和服务配置。");
            // Existing sanitizer validates content and strips any reasoning or other provider fields.
            var sanitized = json.completion(value, "delta");
            String delta = value.path("choices").path(0).path("delta").path("content").asText("");
            if (content.length() + delta.length() > 64000) throw new ProviderFailure("output_limit", "模型正文超出处理上限。");
            content.append(delta);
            if (sanitized.containsKey("usage")) usage = sanitized.get("usage");
            String reason = value.path("choices").path(0).path("finish_reason").asText("");
            if (!reason.isBlank()) finish = reason;
            return firstContent && !content.toString().isBlank();
        }

        private JsonNode result() {
            if ("length".equals(finish)) throw new ProviderFailure("truncated", "模型输出达到 Token 上限，未能完整生成正文，请调整输出限制。");
            if (content.toString().isBlank()) throw new ProviderFailure("missing_content", "模型未生成最终正文（可能仅返回思考内容），请检查模式及输出限制。");
            if (!firstContent && !done && finish.isBlank()) throw new ProviderFailure("incomplete_stream", "模型连接提前断开，正文未完整生成。");
            Map<String, Object> result = new HashMap<>();
            result.put("choices", List.of(Map.of("message", Map.of("content", content.toString()), "finish_reason", finish)));
            if (usage != null) result.put("usage", usage);
            return json.parse(json.encode(result));
        }
    }
}
