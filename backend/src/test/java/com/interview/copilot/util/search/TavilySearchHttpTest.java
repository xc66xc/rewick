package com.interview.copilot.util.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.model.search.WebSearchEndpoint;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TavilySearchHttpTest {
    private HttpServer server;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void startServer() throws java.io.IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor());
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private WebSearchEndpoint endpoint(int timeout) {
        return new WebSearchEndpoint(true,
                "http://127.0.0.1:" + server.getAddress().getPort() + "/search", "fixture-key", 5, "advanced", timeout);
    }

    static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> searchParameters() {
        return java.util.stream.Stream.of("advanced", "basic", "fast", "ultra-fast")
                .flatMap(depth -> java.util.stream.Stream.of("none", "basic", "advanced")
                        .map(mode -> org.junit.jupiter.params.provider.Arguments.of(depth, mode)));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.MethodSource("searchParameters")
    void search_httpRequest_onlySendsQueryAndFixedSearchParameters(String depth, String mode) {
        AtomicReference<com.fasterxml.jackson.databind.JsonNode> body = new AtomicReference<>();
        AtomicReference<String> auth = new AtomicReference<>();
        server.createContext("/search", exchange -> {
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(json.readTree(exchange.getRequestBody()));
            byte[] response = "{\"results\":[{\"title\":\"Source\",\"url\":\"https://example.com\",\"content\":\"Evidence\"}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });

        assertThat(new TavilySearchClient().search("question", new WebSearchEndpoint(true, endpoint(8000).url(), "fixture-key", 5, depth, 8000, mode)).block(Duration.ofSeconds(10)).status()).isEqualTo("ready");
        assertThat(auth.get()).isEqualTo("Bearer fixture-key");
        assertThat(body.get().path("query").asText()).isEqualTo("question");
        assertThat(body.get().path("max_results").asInt()).isEqualTo(5);
        assertThat(body.get().path("search_depth").asText()).isEqualTo(depth);
        if ("none".equals(mode)) assertThat(body.get().path("include_answer").isBoolean()).isTrue();
        else assertThat(body.get().path("include_answer").asText()).isEqualTo(mode);
        assertThat(body.get().has("api_key")).isFalse();
    }

    @Test
    void search_providerError_returnsSafeFailureWithoutProviderBody() {
        server.createContext("/search", exchange -> {
            byte[] response = "fixture-secret-provider-error".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(429, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        assertThatThrownBy(() -> new TavilySearchClient().search("question", endpoint(8000)).block())
                .isInstanceOf(com.interview.copilot.exception.ApiException.class)
                .hasMessageNotContaining("fixture-secret");
    }

    @Test
    void search_slowProvider_timesOut() {
        server.createContext("/search", exchange -> {
            try { Thread.sleep(2000); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            exchange.close();
        });
        assertThatThrownBy(() -> new TavilySearchClient().search("question", endpoint(1000)).block(Duration.ofSeconds(4)))
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);
    }
}
