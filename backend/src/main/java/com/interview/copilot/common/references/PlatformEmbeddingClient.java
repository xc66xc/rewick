package com.interview.copilot.common.references;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.embedding.EmbeddingProtocol;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;

@Component
public class PlatformEmbeddingClient {
    private final PlatformRuntimeService providers;
    private final ProviderHttpClient http;
    private final Semaphore capacity = new Semaphore(4);

    public PlatformEmbeddingClient(PlatformRuntimeService providers, ProviderHttpClient http) {
        this.providers = providers;
        this.http = http;
    }

    public Selection selection() {
        var snapshot = providers.snapshot();
        var config = snapshot.embedding();
        if (!config.isEnabled() || config.getDimensions() != 1024) {
            throw ReferenceErrors.invalid("平台尚未配置可用的 1024 维向量模型。");
        }
        return new Selection(
                config, snapshot.availableEmbeddingServices().getFirst().fingerprint());
    }

    @SuppressWarnings("unchecked")
    public List<List<Double>> embed(Selection selection, List<String> texts) {
        if (texts.isEmpty() || texts.size() > 10) {
            throw ReferenceErrors.invalid("向量批次无效。");
        }
        if (!capacity.tryAcquire()) {
            throw ReferenceErrors.invalid("向量服务繁忙，请稍后重试。");
        }
        try {
            JsonNode body =
                    http.json(
                                    selection.config(),
                                    EmbeddingProtocol.request(texts, selection.config()),
                                    Duration.ofSeconds(30))
                            .block();
            List<Map<String, Object>> rows =
                    (List<Map<String, Object>>)
                            EmbeddingProtocol.response(body, texts.size(), 1024).get("data");
            return rows.stream()
                    .sorted(Comparator.comparingInt(row -> (Integer) row.get("index")))
                    .map(row -> (List<Double>) row.get("embedding"))
                    .toList();
        } finally {
            capacity.release();
        }
    }

    public record Selection(ProviderProperties.Embedding config, String fingerprint) {}
}
