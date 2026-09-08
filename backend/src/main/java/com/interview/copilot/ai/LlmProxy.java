package com.interview.copilot.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class LlmProxy {
    private final ProviderProperties properties;
    private final ProviderHttpClient http;
    private final ProviderJson json;
    private final UsageService usage;
    private final LlmConcurrency concurrency = new LlmConcurrency();

    public LlmProxy(ProviderProperties properties, ProviderHttpClient http, ProviderJson json, UsageService usage) {
        this.properties = properties;
        this.http = http;
        this.json = json;
        this.usage = usage;
    }

    public Object execute(long userId, String requestId, JsonNode input) {
        ProviderProperties.Llm config = properties.getLlm();
        if (!config.isEnabled()) { throw ProviderErrors.unavailable(); }
        Map<String, Object> body = LlmRequestPolicy.request(input, config);
        LlmConcurrency.Permit permit = concurrency.acquire(userId, config.getMaxConcurrent());
        UsageLease lease;
        try { lease = usage.start(userId, LlmRequestPolicy.requestId(requestId), "llm"); }
        catch (RuntimeException exception) { permit.close(); throw exception; }
        if (Boolean.TRUE.equals(body.get("stream"))) {
            return new LlmStreamSession(lease, permit, config.getTotalTimeoutSeconds() * 1000L)
                    .start(stream(config, body));
        }
        return single(config, body, lease, permit);
    }

    private Map<String, Object> single(ProviderProperties.Llm config, Map<String, Object> body,
                                        UsageLease lease, LlmConcurrency.Permit permit) {
        try (permit; lease) {
            try {
                JsonNode response = http.json(config, body, Duration.ofSeconds(config.getTotalTimeoutSeconds())).block();
                Map<String, Object> result = json.completion(response, "message");
                lease.complete();
                return result;
            } catch (RuntimeException exception) {
                lease.fail();
                throw ProviderErrors.failed();
            }
        }
    }

    Flux<String> stream(ProviderProperties.Llm config, Map<String, Object> body) {
        AtomicInteger received = new AtomicInteger();
        AtomicInteger output = new AtomicInteger();
        AtomicBoolean done = new AtomicBoolean();
        return http.stream(config, body).timeout(Duration.ofSeconds(config.getIdleTimeoutSeconds()))
                .takeUntilOther(Mono.delay(Duration.ofSeconds(config.getTotalTimeoutSeconds()))
                        .flatMap(value -> Mono.error(ProviderErrors.failed())))
                .filter(event -> event.data() != null && !event.data().isBlank())
                .map(event -> sanitize(event.data(), received, output, done))
                .takeUntil("[DONE]"::equals)
                .concatWith(Flux.defer(() -> done.get() ? Flux.empty() : Flux.error(ProviderErrors.failed())))
                .onErrorMap(error -> ProviderErrors.failed());
    }

    private String sanitize(String data, AtomicInteger received, AtomicInteger output, AtomicBoolean done) {
        if (received.addAndGet(data.length()) > 2 * 1024 * 1024) { throw ProviderErrors.failed(); }
        if ("[DONE]".equals(data.trim())) {
            if (output.get() == 0) { throw ProviderErrors.failed(); }
            done.set(true);
            return "[DONE]";
        }
        JsonNode input = json.parse(data);
        int length = input.path("choices").path(0).path("delta").path("content").asText("").length();
        if (output.addAndGet(length) > 32768) { throw ProviderErrors.failed(); }
        return json.encode(json.completion(input, "delta"));
    }
}
