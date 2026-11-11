package com.interview.copilot.util.rerank;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.rerank.RerankEndpoint;
import com.interview.copilot.util.ai.ProviderHttpClient;

import org.springframework.stereotype.Component;

import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.Semaphore;

@Component
public class BailianRerankClient {
    private final ProviderHttpClient http;
    private final Semaphore capacity = new Semaphore(4);

    public BailianRerankClient(ProviderHttpClient http) {
        this.http = http;
    }

    public List<BailianRerankProtocol.Score> rank(RerankEndpoint endpoint, String query,
            List<String> documents, long deadlineNanos) {
        return rank(endpoint, query, documents, deadlineNanos, () -> {});
    }

    public List<BailianRerankProtocol.Score> rank(RerankEndpoint endpoint, String query,
            List<String> documents, long deadlineNanos, Runnable onSubmitted) {
        requireActive();
        if (!endpoint.enabled()) throw new ProviderFailure("unavailable", "重排序服务尚未配置或已停用。");
        if (!capacity.tryAcquire()) throw new ProviderFailure("queue_full", "重排序服务繁忙，已保留原排序。");
        try {
            long nanos = Math.min(Duration.ofMillis(endpoint.timeoutMs()).toNanos(), deadlineNanos - System.nanoTime());
            if (nanos <= 0) throw new ProviderFailure("timeout", "重排序等待预算已用尽。");
            var transport = transport(endpoint);
            var body = BailianRerankProtocol.request(endpoint.model(), query, documents);
            var request = http.json(transport, body, Duration.ofNanos(nanos));
            var response = Mono.defer(() -> {
                requireActive();
                if (System.nanoTime() >= deadlineNanos) throw new ProviderFailure("timeout", "重排序等待预算已用尽。");
                onSubmitted.run();
                return request;
            }).timeout(Duration.ofNanos(nanos)).block();
            requireActive();
            if (System.nanoTime() >= deadlineNanos) throw new ProviderFailure("timeout", "重排序等待预算已用尽。");
            return BailianRerankProtocol.response(response, documents.size());
        } catch (RuntimeException error) {
            requireActive(error);
            throw error;
        } finally {
            capacity.release();
        }
    }

    public static void requireActive() {
        if (Thread.currentThread().isInterrupted()) throw new CancellationException("Reference retrieval cancelled");
    }

    public static void requireActive(Throwable error) {
        requireActive();
        Throwable current = error;
        for (int depth = 0; current != null && depth < 10; depth++, current = current.getCause()) {
            if (current instanceof CancellationException || current instanceof InterruptedException) {
                throw new CancellationException("Reference retrieval cancelled");
            }
        }
    }

    private ProviderProperties.Endpoint transport(RerankEndpoint endpoint) {
        var transport = new ProviderProperties.Endpoint();
        transport.setUrl(endpoint.url());
        transport.setApiKey(endpoint.apiKey());
        return transport;
    }
}
