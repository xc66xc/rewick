package com.interview.copilot.service.impl.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.exception.platform.PlatformConfigErrors;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.request.platform.PlatformProbeRequest;
import com.interview.copilot.response.platform.PlatformProbeResponse;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.platform.PlatformConfigService;
import com.interview.copilot.service.platform.PlatformProbeService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.util.asr.AsrProviderProbe;
import com.interview.copilot.validation.ai.LlmRequestPolicy;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;

@Service
public class PlatformProbeServiceImpl implements PlatformProbeService {
    private final PlatformConfigService configs;
    private final ProviderHttpClient http;
    private final ProviderJson json;
    private final AsrProviderProbe asr;
    private final AuditService audit;
    private final com.interview.copilot.util.search.WebSearchClient search;
    private final Semaphore capacity = new Semaphore(4);

    public PlatformProbeServiceImpl(
            PlatformConfigService configs,
            ProviderHttpClient http,
            ProviderJson json,
            AsrProviderProbe asr,
            AuditService audit, com.interview.copilot.util.search.WebSearchClient search) {
        this.configs = configs;
        this.http = http;
        this.json = json;
        this.asr = asr;
        this.audit = audit;
        this.search = search;
    }

    public PlatformProbeResponse test(long actorId, PlatformProbeRequest input) {
        if (input == null
                || input.capability() == null
                || !Set.of("llm", "asr", "embedding", "web-search").contains(input.capability())) {
            throw PlatformConfigErrors.invalid("请选择需要测试的服务能力。");
        }
        PlatformSnapshot snapshot = configs.draft(input.config());
        if (!capacity.tryAcquire()) {
            throw ProviderErrors.busy();
        }
        long started = System.nanoTime();
        boolean success = false;
        try {
            probe(snapshot, input);
            success = true;
            return new PlatformProbeResponse(true, "服务测试通过。", elapsed(started));
        } catch (RuntimeException error) {
            var failure = com.interview.copilot.util.ai.ProviderFailureClassifier.classify(error);
            String message = failure.getMessage();
            return new PlatformProbeResponse(false, message, elapsed(started));
        } finally {
            capacity.release();
            audit.record(
                    actorId,
                    success ? "platform.config.test.success" : "platform.config.test.failed",
                    input.capability());
        }
    }

    private void probe(PlatformSnapshot snapshot, PlatformProbeRequest input) {
        switch (input.capability()) {
            case "llm" -> llm(snapshot, input.modelId());
            case "asr" -> asr.test(snapshot.asr());
            case "embedding" -> embedding(snapshot);
            case "web-search" -> webSearch(snapshot);
            default -> throw PlatformConfigErrors.invalid("服务能力无效。");
        }
    }

    private void webSearch(PlatformSnapshot snapshot) {
        var endpoint = snapshot.webSearch();
        if (!endpoint.enabled()) throw ProviderErrors.unavailable();
        search.search("Web search connection test", endpoint).block();
    }

    private void llm(PlatformSnapshot snapshot, String modelId) {
        var endpoint = snapshot.llm(modelId == null || modelId.isBlank() ? null : modelId).config();
        Map<String, Object> body =
                Map.of(
                        "model",
                        endpoint.getModel(),
                        "stream",
                        false,
                        "max_tokens",
                        Math.min(512, endpoint.getMaxOutputTokens()),
                        "messages",
                        List.of(Map.of("role", "user", "content", "Reply OK.")));
        JsonNode response =
                com.interview.copilot.util.ai.ProviderCompletions.probe(http, json,
                                endpoint,
                                LlmRequestPolicy.request(json.parse(json.encode(body)), endpoint),
                                Duration.ofSeconds(Math.min(30, endpoint.getTotalTimeoutSeconds())))
                        .block();
        json.completion(response, "message");
    }

    private void embedding(PlatformSnapshot snapshot) {
        var endpoint = snapshot.embedding();
        if (!endpoint.isEnabled()) {
            throw ProviderErrors.unavailable();
        }
        JsonNode response =
                http.json(
                                endpoint,
                                com.interview.copilot.util.embedding.EmbeddingProtocol.request(
                                        List.of("资料检索连接测试"), endpoint),
                                Duration.ofSeconds(8))
                        .block();
        com.interview.copilot.util.embedding.EmbeddingProtocol.response(
                response, 1, endpoint.getDimensions());
    }

    private long elapsed(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }
}
