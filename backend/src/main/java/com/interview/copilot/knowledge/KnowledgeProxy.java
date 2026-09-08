package com.interview.copilot.knowledge;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.ai.LlmRequestPolicy;
import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderHttpClient;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.platform.EnvironmentPlatformResolver;
import com.interview.copilot.platform.PlatformRuntimeResolver;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class KnowledgeProxy {
    private final PlatformRuntimeResolver providers;
    private final ProviderHttpClient http;
    private final UsageService usage;
    private final Semaphore capacity = new Semaphore(16);

    public KnowledgeProxy(ProviderProperties properties, ProviderHttpClient http, UsageService usage) {
        this(new EnvironmentPlatformResolver(properties), http, usage);
    }

    @Autowired
    public KnowledgeProxy(PlatformRuntimeResolver providers, ProviderHttpClient http, UsageService usage) {
        this.providers = providers;
        this.http = http;
        this.usage = usage;
    }

    public Map<String, Object> search(long userId, String requestId, JsonNode input) {
        validate(input);
        ProviderProperties.Knowledge config = providers.snapshot().knowledge();
        if (!config.isEnabled()) { throw ProviderErrors.unavailable(); }
        if (!capacity.tryAcquire()) { throw ProviderErrors.busy(); }
        try { return reservedSearch(userId, requestId, input, config); }
        finally { capacity.release(); }
    }

    private Map<String, Object> reservedSearch(long userId, String requestId, JsonNode input,
                                                ProviderProperties.Knowledge config) {
        // Reservation deliberately sits outside the provider-failure downgrade boundary.
        String identifier = LlmRequestPolicy.requestId(requestId);
        UsageLease lease = usage.start(userId, identifier, "knowledge");
        try (lease) {
            usage.describeModel(userId, identifier, "knowledge", config.getAgentId());
            try {
                Map<String, Object> body = Map.of("query", input.get("query").asText(),
                        "agent_id", config.getAgentId(), "images", List.of());
                JsonNode response = http.json(config, body, Duration.ofSeconds(config.getTimeoutSeconds())).block();
                Map<String, Object> result = extract(response);
                lease.complete();
                return result;
            } catch (RuntimeException exception) {
                lease.fail();
                return Map.of("success", false, "message", "知识检索暂时不可用，本次继续回答",
                        "data", Map.of("nodes", List.of()));
            }
        }
    }

    private void validate(JsonNode input) {
        LlmRequestPolicy.requireFields(input, Set.of("query", "agent_id", "images"));
        JsonNode query = input.path("query");
        if (!query.isTextual() || query.asText().isBlank() || query.asText().length() > 20000) {
            throw ProviderErrors.invalid();
        }
        if (input.has("agent_id") && !"platform".equals(input.get("agent_id").asText())) {
            throw ProviderErrors.invalid();
        }
        if (input.has("images") && (!input.get("images").isArray() || !input.get("images").isEmpty())) {
            throw ProviderErrors.invalid();
        }
    }

    Map<String, Object> extract(JsonNode input) {
        if (input == null || !input.path("success").isBoolean() || !input.path("success").asBoolean(false)
                || !input.path("data").path("nodes").isArray()) {
            throw ProviderErrors.failed();
        }
        for (String field : List.of("code", "status")) {
            if (input.has(field) && !"SUCCESS".equalsIgnoreCase(input.get(field).asText())) { throw ProviderErrors.failed(); }
        }
        if (input.has("status_code") && input.get("status_code").asInt() != 200) { throw ProviderErrors.failed(); }
        List<Map<String, String>> nodes = new ArrayList<>();
        int remaining = 6000;
        for (JsonNode node : input.path("data").path("nodes")) {
            if (nodes.size() >= 6 || remaining <= 0) { break; }
            if (!node.path("text").isTextual()) { continue; }
            String text = node.get("text").asText().trim();
            if (text.isEmpty()) { continue; }
            text = text.substring(0, Math.min(text.length(), Math.min(2000, remaining)));
            remaining -= text.length();
            nodes.add(Map.of("text", text));
        }
        return Map.of("success", true, "data", Map.of("nodes", List.copyOf(nodes)));
    }
}
