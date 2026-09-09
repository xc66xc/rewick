package com.interview.copilot.embedding;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.ai.LlmRequestPolicy;
import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderHttpClient;
import com.interview.copilot.platform.PlatformRuntimeResolver;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

@Service
public final class EmbeddingProxy {
    private final PlatformRuntimeResolver providers;
    private final ProviderHttpClient http;
    private final UsageService usage;
    private final Semaphore capacity = new Semaphore(8);

    public EmbeddingProxy(PlatformRuntimeResolver providers, ProviderHttpClient http, UsageService usage) {
        this.providers = providers;
        this.http = http;
        this.usage = usage;
    }

    public Map<String, Object> embed(long userId, String requestId, JsonNode input) {
        var texts = EmbeddingProtocol.input(input);
        var config = providers.snapshot().embedding(input.get("serviceId").asText());
        EmbeddingProtocol.validateSelection(input, config);
        String identifier = LlmRequestPolicy.requestId(requestId);
        if (!capacity.tryAcquire()) { throw ProviderErrors.busy(); }
        try (UsageLease lease = usage.start(userId, identifier, "knowledge")) {
            usage.describeModel(userId, identifier, "knowledge", config.getModel());
            try {
                JsonNode response = http.json(config, EmbeddingProtocol.request(texts, config), Duration.ofSeconds(30)).block();
                var result = EmbeddingProtocol.response(response, texts.size(), config.getDimensions());
                lease.complete();
                return result;
            } catch (RuntimeException error) {
                lease.fail();
                throw ProviderErrors.failed();
            }
        } finally { capacity.release(); }
    }
}
