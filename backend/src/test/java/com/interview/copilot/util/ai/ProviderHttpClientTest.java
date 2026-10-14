package com.interview.copilot.util.ai;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProviderHttpClientTest {
    @ParameterizedTest
    @ValueSource(ints = {400,401,403,404,422,429,500})
    void json_supplierRejection_preservesStatusWithoutBodySecrets(int status) throws Exception {
        verify(status, "{\"error\":\"fake-key-and-private-document\"}", "http_error", "HTTP " + status);
    }

    @Test void json_invalidResponse_preservesSafeClassification() throws Exception {
        verify(200, "private-document-not-json", "invalid_json", "JSON");
    }

    private void verify(int status, String body, String reason, String message) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/", exchange -> {
            exchange.getRequestBody().readAllBytes();
            exchange.getResponseHeaders().add("Content-Type","application/json");
            exchange.sendResponseHeaders(status,body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
            try(var output=exchange.getResponseBody()) { output.write(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
        });
        server.start();
        try {
            var endpoint = new ProviderProperties.Embedding();
            endpoint.setUrl("http://127.0.0.1:"+server.getAddress().getPort()+"/");
            endpoint.setApiKey("test-only-secret");
            assertThatThrownBy(() -> new ProviderHttpClient().json(endpoint,Map.of("input","synthetic"),Duration.ofSeconds(5)).block())
                    .isInstanceOfSatisfying(ProviderFailure.class, failure -> {
                        org.assertj.core.api.Assertions.assertThat(failure.reason()).isEqualTo(reason);
                        org.assertj.core.api.Assertions.assertThat(failure.getMessage()).contains(message).doesNotContain("fake-key","private-document","test-only-secret");
                        org.assertj.core.api.Assertions.assertThat(failure.getCause()).isNull();
                    });
        } finally { server.stop(0); }
    }
}
