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
        return selection(providers.snapshot());
    }
    public Selection selection(com.interview.copilot.model.platform.PlatformSnapshot snapshot) {
        if (snapshot == null) throw ReferenceErrors.invalid("平台向量配置加载失败。");
        var config = snapshot.embedding();
        if (!config.isEnabled() || config.getDimensions() != 1024) {
            throw ReferenceErrors.invalid("平台尚未配置可用的 1024 维向量模型。");
        }
        return new Selection(
                config, snapshot.availableEmbeddingServices().getFirst().fingerprint());
    }

    public List<List<Double>> embed(Selection selection,List<String> texts,
            com.interview.copilot.model.operations.OperationContext context) {
        return embed(selection, texts, context, System.nanoTime() + Duration.ofSeconds(30).toNanos());
    }
    public List<List<Double>> embed(Selection selection,List<String> texts,
            com.interview.copilot.model.operations.OperationContext context, long deadlineNanos) {
        try {
            var result=embed(selection,texts, deadlineNanos);
            if(context!=null) context.model(selection.config().getModel()).finish("retrieval.embedding","success",Map.of());
            return result;
        } catch (RuntimeException error) {
            boolean cancelled = error instanceof java.util.concurrent.CancellationException || Thread.currentThread().isInterrupted();
            if (context != null) context.finish("retrieval.embedding", cancelled ? "cancelled" : "error", Map.of());
            if (cancelled) throw new java.util.concurrent.CancellationException();
            throw error;
        }
    }
    @SuppressWarnings("unchecked")
    public List<List<Double>> embed(Selection selection,List<String> texts) {
        return embed(selection, texts, System.nanoTime() + Duration.ofSeconds(30).toNanos());
    }
    @SuppressWarnings("unchecked")
    private List<List<Double>> embed(Selection selection,List<String> texts, long deadlineNanos) {
        com.interview.copilot.model.references.ReferenceQueryPlan.checkCancellation();
        if (texts.isEmpty() || texts.size() > 10) {
            throw ReferenceErrors.invalid("向量批次无效。");
        }
        if (!capacity.tryAcquire()) {
            throw ReferenceErrors.invalid("向量服务繁忙，请稍后重试。");
        }
        try {
            var timeout = Duration.ofNanos(com.interview.copilot.model.references.ReferenceQueryPlan.remainingNanos(deadlineNanos));
            if (timeout.isZero()) throw ReferenceErrors.invalid("向量检索时间预算已用尽。");
            JsonNode body =
                    http.json(
                                    selection.config(),
                                    EmbeddingProtocol.request(texts, selection.config()),
                                    timeout)
                            .block(timeout);
            com.interview.copilot.model.references.ReferenceQueryPlan.checkCancellation();
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
