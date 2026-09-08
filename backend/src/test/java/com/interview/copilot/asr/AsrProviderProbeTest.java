package com.interview.copilot.asr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.ai.ProviderJson;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.common.ApiException;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

class AsrProviderProbeTest {
    private final ProviderJson json = new ProviderJson(new ObjectMapper());
    private final AsrProviderProbe probe = new AsrProviderProbe(json);
    private final List<JsonNode> requests = new CopyOnWriteArrayList<>();
    private final AtomicInteger audioBytes = new AtomicInteger();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final CountDownLatch disconnected = new CountDownLatch(1);
    private DisposableServer server;

    @AfterEach void close() {
        probe.shutdown();
        if (server != null) { server.disposeNow(); }
    }

    @Test void test_realWebSocket_runsTaskThenFinishesWithoutAudio() throws InterruptedException {
        server = server(false);

        probe.test(endpoint());

        assertThat(requests).hasSize(2);
        assertThat(requests.getFirst().path("header").path("action").asText()).isEqualTo("run-task");
        assertThat(requests.getFirst().path("payload").path("model").asText()).isEqualTo("fixture-asr");
        assertThat(requests.getFirst().path("payload").path("parameters").path("sample_rate").asInt()).isEqualTo(16000);
        assertThat(requests.getLast().path("header").path("action").asText()).isEqualTo("finish-task");
        assertThat(requests.getLast().path("header").path("task_id")).isEqualTo(requests.getFirst().path("header").path("task_id"));
        assertThat(audioBytes).hasValue(0);
        assertThat(authorization).hasValue("Bearer fixture-asr-secret");
        assertThat(disconnected.await(3, TimeUnit.SECONDS)).isTrue();
    }

    @Test void test_handshakeSucceedsButTaskFails_returnsSafeFailure() {
        server = server(true);

        assertThatThrownBy(() -> probe.test(endpoint())).isInstanceOf(ApiException.class)
                .hasMessageNotContaining("provider-private-error");
        assertThat(requests).hasSize(1);
    }

    private ProviderProperties.Asr endpoint() {
        ProviderProperties.Asr endpoint = new ProviderProperties.Asr();
        endpoint.setUrl("ws://127.0.0.1:" + server.port() + "/asr?mode=manual");
        endpoint.setApiKey("fixture-asr-secret");
        endpoint.setModel("fixture-asr");
        return endpoint;
    }

    private DisposableServer server(boolean failTask) {
        return HttpServer.create().port(0).handle((request, response) -> {
            authorization.set(request.requestHeaders().get("Authorization"));
            return response.sendWebsocket((input, output) -> {
                input.withConnection(connection -> connection.onDispose().doFinally(signal -> disconnected.countDown()).subscribe());
                return output.sendString(input.receiveFrames().doOnNext(frame -> {
                    if (frame instanceof BinaryWebSocketFrame binary) { audioBytes.addAndGet(binary.content().readableBytes()); }
                }).filter(frame -> frame instanceof TextWebSocketFrame)
                        .map(frame -> reply(((TextWebSocketFrame) frame).text(), failTask))).then();
            });
        }).bindNow();
    }

    private String reply(String text, boolean failTask) {
        JsonNode request = json.parse(text);
        requests.add(request);
        String action = request.path("header").path("action").asText();
        String event = failTask ? "task-failed" : (action.equals("run-task") ? "task-started" : "task-finished");
        return json.encode(Map.of("header", Map.of("event", event, "task_id", request.path("header").path("task_id").asText(),
                "error", "provider-private-error"), "payload", Map.of()));
    }
}
