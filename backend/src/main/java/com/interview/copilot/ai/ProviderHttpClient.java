package com.interview.copilot.ai;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.netty.http.client.HttpClient;

@Component
public class ProviderHttpClient {
    private final WebClient client;
    private final WebClient streamingClient;

    public ProviderHttpClient() {
        HttpClient transport = HttpClient.create().followRedirect(false)
                .option(io.netty.channel.ChannelOption.CONNECT_TIMEOUT_MILLIS, 10000);
        client = build(transport, 2 * 1024 * 1024);
        streamingClient = build(transport, 65536);
    }

    private WebClient build(HttpClient transport, int maximumBytes) {
        return WebClient.builder().clientConnector(new ReactorClientHttpConnector(transport))
                .codecs(config -> config.defaultCodecs().maxInMemorySize(maximumBytes)).build();
    }

    public Mono<JsonNode> json(ProviderProperties.Endpoint endpoint, Map<String, Object> body, Duration timeout) {
        return request(client, endpoint, body).exchangeToMono(response -> {
            if (!response.statusCode().is2xxSuccessful()) {
                return response.releaseBody().then(Mono.error(ProviderErrors.failed()));
            }
            return response.bodyToMono(JsonNode.class).switchIfEmpty(Mono.error(ProviderErrors.failed()));
        }).timeout(timeout).onErrorMap(error -> ProviderErrors.failed());
    }

    public Flux<ServerSentEvent<String>> stream(ProviderProperties.Endpoint endpoint, Map<String, Object> body) {
        return request(streamingClient, endpoint, body).exchangeToFlux(response -> {
            if (!response.statusCode().is2xxSuccessful()
                    || !response.headers().contentType().orElse(MediaType.APPLICATION_OCTET_STREAM)
                    .isCompatibleWith(MediaType.TEXT_EVENT_STREAM)) {
                return response.releaseBody().thenMany(Flux.error(ProviderErrors.failed()));
            }
            ProviderSseDecoder decoder = new ProviderSseDecoder();
            return response.bodyToFlux(DataBuffer.class).publishOn(Schedulers.boundedElastic(), 1).concatMapIterable(buffer -> {
                try { return decoder.accept(buffer); }
                finally { DataBufferUtils.release(buffer); }
            }, 1).concatWith(Flux.defer(() -> Flux.fromIterable(decoder.finish())))
                    .doOnDiscard(DataBuffer.class, DataBufferUtils::release);
        });
    }

    private WebClient.RequestHeadersSpec<?> request(WebClient webClient, ProviderProperties.Endpoint endpoint,
                                                   Map<String, Object> body) {
        return webClient.post().uri(endpoint.getUrl()).contentType(MediaType.APPLICATION_JSON)
                .headers(headers -> {
                    if (!endpoint.getApiKey().isBlank()) { headers.setBearerAuth(endpoint.getApiKey()); }
                }).bodyValue(body);
    }
}
