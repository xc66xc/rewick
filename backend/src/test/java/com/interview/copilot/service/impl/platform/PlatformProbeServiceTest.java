package com.interview.copilot.service.impl.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.request.platform.PlatformProbeRequest;
import com.interview.copilot.service.platform.PlatformProbeService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.util.asr.AsrProviderProbe;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

public class PlatformProbeServiceTest {
    private final PlatformConfigFixture fixture = new PlatformConfigFixture();
    private final ProviderJson json = new ProviderJson(fixture.json);
    private final AsrProviderProbe asr = new AsrProviderProbe(json);
    private final PlatformProbeService probes =
            new PlatformProbeServiceImpl(
                    fixture.service, new ProviderHttpClient(), json, asr, fixture.audit);
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final AtomicReference<String> body = new AtomicReference<>();
    private DisposableServer server;

    @AfterEach
    void close() {
        asr.shutdown();
        fixture.close();
        if (server != null) {
            server.disposeNow();
        }
    }

    @Test
    void test_llmDraft_probesSelectedUpstreamModelWithoutPublishing() {
        respond(
                json.encode(
                        Map.of("choices", List.of(Map.of("message", Map.of("content", "OK"))))));

        var result = probes.test(1, new PlatformProbeRequest(config("llm"), "llm", "fast"));

        assertThat(result.success()).isTrue();
        assertThat(authorization).hasValue("Bearer fixture-secret");
        assertThat(json.parse(body.get()).path("model").asText()).isEqualTo("upstream-fast");
        assertThat(json.parse(body.get()).path("max_tokens").asInt()).isEqualTo(16);
        assertThat(fixture.row.get().published()).isFalse();
        verify(fixture.audit).record(1, "platform.config.test.success", "llm");
    }

    @Test
    void test_knowledgeDraft_usesConfiguredAgentAndValidatesResponseShape() {
        respond("{\"success\":true,\"data\":{\"nodes\":[{\"text\":\"fixture knowledge\"}]}}");

        var result =
                probes.test(1, new PlatformProbeRequest(config("knowledge"), "knowledge", null));

        assertThat(result.success()).isTrue();
        assertThat(json.parse(body.get()).path("agent_id").asText()).isEqualTo("fixture-agent");
        assertThat(result.message()).doesNotContain("fixture knowledge");
        assertThat(fixture.row.get().published()).isFalse();
    }

    @Test
    void test_providerError_doesNotExposeResponseOrChangeSavedConfiguration() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "original-secret"));
        respond(
                "{\"error\":{\"message\":\"provider-sensitive-detail\"},\"apiKey\":\"third-party-key\"}");
        PlatformConfig draft = config("llm");
        draft =
                new PlatformConfig(
                        1,
                        draft.providers(),
                        draft.models(),
                        draft.defaultModelId(),
                        draft.asr(),
                        draft.knowledge());

        var result = probes.test(1, new PlatformProbeRequest(draft, "llm", "fast"));

        assertThat(result.success()).isFalse();
        assertThat(result.message()).doesNotContain("provider-sensitive-detail", "third-party-key");
        assertThat(fixture.service.snapshot().llm("fast").config().getApiKey())
                .isEqualTo("original-secret");
        assertThat(fixture.service.get().version()).isEqualTo(1);
    }

    private PlatformConfig config(String kind) {
        boolean llm = kind.equals("llm");
        var provider =
                new PlatformConfig.Provider(
                        "primary",
                        "测试服务",
                        kind,
                        "http://127.0.0.1:" + server.port() + "/probe",
                        true,
                        false,
                        "fixture-secret");
        return new PlatformConfig(
                0,
                List.of(provider),
                llm ? PlatformConfigFixture.config(0, "").models() : List.of(),
                llm ? "fast" : "",
                new PlatformConfig.Asr(false, "", ""),
                new PlatformConfig.Knowledge(
                        !llm, llm ? "" : "primary", llm ? "" : "fixture-agent"));
    }

    private void respond(String responseBody) {
        server =
                HttpServer.create()
                        .port(0)
                        .handle(
                                (request, response) -> {
                                    authorization.set(
                                            request.requestHeaders().get("Authorization"));
                                    return response.header("Content-Type", "application/json")
                                            .sendString(
                                                    request.receive()
                                                            .aggregate()
                                                            .asString()
                                                            .flatMap(
                                                                    value -> {
                                                                        body.set(value);
                                                                        return Mono.just(
                                                                                responseBody);
                                                                    }));
                                })
                        .bindNow();
    }
}
