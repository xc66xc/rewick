package com.interview.copilot.util.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.model.search.WebSearchEndpoint;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DeepSeekSearchHttpTest {
    private final ObjectMapper json = new ObjectMapper();
    private final AtomicReference<JsonNode> body = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private HttpServer server;
    private ExecutorService executor;

    @BeforeEach
    void startServer() throws java.io.IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(executor);
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
        executor.shutdownNow();
    }

    @Test
    void search_usesBearerAndDeepSeekParameters_withUnicodeSafeQueryLimit() throws Exception {
        respond(200, "{\"results\":[{\"title\":\"Source\",\"url\":\"https://example.com\",\"summary\":\"Summary\",\"rerank_score\":2.4}]}");
        String longQuestion = "中".repeat(127) + "😀" + "trailing content";

        var actual = new DeepSeekSearchClient().search(longQuestion, endpoint(8000)).block(Duration.ofSeconds(10));

        assertThat(actual.status()).isEqualTo("ready");
        assertThat(authorization.get()).isEqualTo("Bearer fixture-deepseek-key");
        String query = body.get().path("query").asText();
        assertThat(query).isEqualTo("中".repeat(127) + "😀");
        assertThat(query.codePointCount(0, query.length())).isEqualTo(128);
        assertThat(body.get().path("count").asInt()).isEqualTo(4);
        assertThat(body.get().path("need_content").isBoolean()).isTrue();
        assertThat(body.get().path("need_content").asBoolean()).isFalse();
        assertThat(body.get().has("api_key")).isFalse();
        assertThat(body.get().has("max_results")).isFalse();
        assertThat(body.get().has("search_depth")).isFalse();
        assertThat(body.get().has("include_answer")).isFalse();
    }

    @Test
    void search_providerError_doesNotExposeBodyOrCredentials() throws Exception {
        respond(429, "fixture-secret-provider-error");

        assertThatThrownBy(() -> new DeepSeekSearchClient().search("question", endpoint(8000)).block())
                .isInstanceOf(com.interview.copilot.exception.ApiException.class)
                .hasMessageNotContaining("fixture-secret").hasMessageNotContaining("fixture-deepseek-key");
    }

    @Test
    void search_slowProvider_obeysConfiguredTimeout() throws Exception {
        server.createContext("/v1/tools/search", exchange -> {
            try {
                Thread.sleep(2000);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });

        assertThatThrownBy(() -> new DeepSeekSearchClient().search("question", endpoint(1000)).block(Duration.ofSeconds(4)))
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);
    }

    private WebSearchEndpoint endpoint(int timeout) throws Exception {
        return json.readValue(json.writeValueAsString(Map.of(
                "enabled", true, "url", "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/tools/search",
                "apiKey", "fixture-deepseek-key", "topK", 4, "searchDepth", "advanced", "timeoutMs", timeout,
                "includeAnswer", "advanced", "searchProtocol", "deepseek")), WebSearchEndpoint.class);
    }

    private void respond(int status, String response) {
        server.createContext("/v1/tools/search", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(json.readTree(exchange.getRequestBody()));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
    }
}
