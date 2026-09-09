package com.interview.copilot.knowledge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.ai.ProviderHttpClient;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

class KnowledgeProxyTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ProviderProperties settings = new ProviderProperties();
    private final UsageService usage = mock(UsageService.class);
    private final UsageLease lease = mock(UsageLease.class);
    private KnowledgeProxy proxy;
    private DisposableServer server;

    @BeforeEach void setUp() {
        settings.getKnowledge().setApiKey("server-secret");
        settings.getKnowledge().setAgentId("server-agent");
        when(usage.start(anyLong(), anyString(), anyString())).thenReturn(lease);
        proxy = new KnowledgeProxy(settings, new ProviderHttpClient(), usage);
    }

    @AfterEach void cleanUp() { if (server != null) { server.disposeNow(); } }

    @Test
    void search_rebuildsRequestAndKeepsOnlyBoundedText() {
        AtomicReference<String> captured = new AtomicReference<>();
        String response = mapper.valueToTree(Map.of("success", true, "data", Map.of("nodes",
                java.util.Collections.nCopies(10, Map.of("text", "x".repeat(4000), "secret", "hidden"))))).toString();
        server = HttpServer.create().port(0).handle((request, output) -> request.receive().aggregate().asString()
                .flatMap(body -> { captured.set(body); return output.header("Content-Type", "application/json").sendString(Mono.just(response)).then(); })).bindNow();
        endpoint();

        JsonNode result = mapper.valueToTree(proxy.search(1, "rag", input()));

        assertThat(captured.get()).contains("server-agent").doesNotContain("platform");
        assertThat(result.path("data").path("nodes")).hasSize(3);
        assertThat(result.toString()).doesNotContain("hidden", "secret");
        assertThat(result.path("data").path("nodes").get(0).path("text").asText()).hasSize(2000);
        verify(lease).complete();
    }

    @Test
    void search_quotaFailure_neverBecomesKnowledgeDegradation() {
        settings.getKnowledge().setUrl("http://127.0.0.1:12345/search");
        when(usage.start(anyLong(), anyString(), anyString())).thenThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS, "quota_exceeded", "quota"));

        assertThatThrownBy(() -> proxy.search(1, "quota", input())).isInstanceOf(ApiException.class).hasMessage("quota");
    }

    @Test
    void search_providerFailure_returnsSafeDegradation() {
        server = HttpServer.create().port(0).handle((request, response) -> response.status(500)
                .sendString(Mono.just("internal secret auth metadata"))).bindNow();
        endpoint();

        Map<String, Object> result = proxy.search(1, "failure", input());

        assertThat(result).containsEntry("success", false);
        assertThat(result.toString()).doesNotContain("internal", "secret", "metadata");
        verify(lease).fail();
    }

    @Test
    void search_unapprovedEndpointField_rejects() {
        JsonNode request = mapper.valueToTree(Map.of("query", "question", "url", "https://evil.invalid"));
        assertThatThrownBy(() -> proxy.search(1, "invalid", request)).isInstanceOf(ApiException.class);
    }

    @Test void search_selectedService_usesBindingWithoutForwardingSelectionToSupplier() {
        AtomicReference<String> captured = new AtomicReference<>();
        server = HttpServer.create().port(0).handle((request, output) -> request.receive().aggregate().asString()
                .flatMap(body -> {
                    captured.set(body);
                    return output.header("Content-Type", "application/json")
                            .sendString(Mono.just("{\"success\":true,\"data\":{\"nodes\":[]}}")).then();
                })).bindNow();
        endpoint();
        JsonNode request = mapper.valueToTree(Map.of("query", "question", "agent_id", "platform", "images", List.of(),
                "serviceId", "environment-knowledge"));

        Map<String, Object> result = proxy.search(1, "selected-rag", request);

        assertThat(result).containsEntry("success", true);
        assertThat(captured.get()).contains("server-agent").doesNotContain("serviceId", "environment-knowledge");
    }

    @Test void search_staleSelection_rejectsBeforeReservingOrCallingAnySupplier() {
        AtomicInteger calls = new AtomicInteger();
        server = HttpServer.create().port(0).handle((request, response) -> {
            calls.incrementAndGet();
            return response.send();
        }).bindNow();
        endpoint();
        JsonNode request = mapper.valueToTree(Map.of("query", "question", "serviceId", "retired-knowledge"));

        assertThatThrownBy(() -> proxy.search(1, "stale-rag", request)).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("SERVICE_UNAVAILABLE");
        assertThat(calls).hasValue(0);
        verifyNoInteractions(usage);
    }

    @ParameterizedTest @ValueSource(strings = {"null", "42", "\"\"", "\"bad/id\""})
    void search_invalidSelectionShape_returnsValidationError(String selection) throws Exception {
        JsonNode request = mapper.readTree("{\"query\":\"question\",\"serviceId\":" + selection + "}");

        assertThatThrownBy(() -> proxy.search(1, "bad-selection", request)).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("INVALID_AI_REQUEST");
        verifyNoInteractions(usage);
    }

    private JsonNode input() { return mapper.valueToTree(Map.of("query", "question", "agent_id", "platform", "images", List.of())); }
    private void endpoint() { settings.getKnowledge().setUrl("http://127.0.0.1:" + server.port() + "/search"); }
}
