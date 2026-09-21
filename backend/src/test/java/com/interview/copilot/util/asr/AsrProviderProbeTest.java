package com.interview.copilot.util.asr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.util.ai.ProviderJson;

import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 校验语音协议配置并验证实时语音服务的完整生命周期。
 */
public class AsrProviderProbeTest {
    private final ProviderJson json = new ProviderJson(new ObjectMapper());
    private final AsrProviderProbe probe = new AsrProviderProbe(json);
    private final List<JsonNode> requests = new CopyOnWriteArrayList<>();
    private final AtomicInteger audioBytes = new AtomicInteger();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final CountDownLatch disconnected = new CountDownLatch(1);
    private DisposableServer server;

    @AfterEach
    void close() {
        probe.shutdown();
        if (server != null) {
            server.disposeNow();
        }
    }

    @Test
    void test_realWebSocket_sendsSyntheticAudioBeforeFinishing() throws InterruptedException {
        server = server(false);

        probe.test(endpoint());

        assertThat(requests).hasSize(2);
        assertThat(requests.getFirst().path("header").path("action").asText())
                .isEqualTo("run-task");
        assertThat(requests.getFirst().path("payload").path("model").asText())
                .isEqualTo("fixture-asr");
        assertThat(
                        requests.getFirst()
                                .path("payload")
                                .path("parameters")
                                .path("sample_rate")
                                .asInt())
                .isEqualTo(16000);
        assertThat(requests.getLast().path("header").path("action").asText())
                .isEqualTo("finish-task");
        assertThat(requests.getLast().path("header").path("task_id"))
                .isEqualTo(requests.getFirst().path("header").path("task_id"));
        assertThat(audioBytes).hasValue(16000);
        assertThat(authorization).hasValue("Bearer fixture-asr-secret");
        assertThat(disconnected.await(3, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    void test_handshakeSucceedsButTaskFails_returnsSafeFailure() {
        server = server(true);

        assertThatThrownBy(() -> probe.test(endpoint()))
                .isInstanceOf(ApiException.class)
                .hasMessageNotContaining("provider-private-error");
        assertThat(requests).hasSize(1);
    }

    @Test
    void test_realtime_sendsBase64AudioAndWaitsForFinish() {
        server = server(false);
        ProviderProperties.Asr endpoint = realtimeEndpoint();
        probe.test(endpoint);
        assertThat(requests).hasSize(3);
        assertThat(requests.getFirst().path("type").asText()).isEqualTo("session.update");
        assertThat(requests.getLast().path("type").asText()).isEqualTo("session.finish");
        assertThat(audioBytes.get()).isEqualTo(16000);
    }

    @Test
    void test_realtimeError_doesNotTreatHandshakeAsSuccess() {
        server = server(true);
        assertThatThrownBy(() -> probe.test(realtimeEndpoint())).isInstanceOf(ApiException.class);
    }

    private ProviderProperties.Asr realtimeEndpoint() {
        ProviderProperties.Asr endpoint = endpoint();
        endpoint.setModel(com.interview.copilot.model.asr.LiveTranslateSession.MODEL);
        endpoint.setUrl("ws://127.0.0.1:" + server.port() + "/api-ws/v1/realtime");
        return endpoint;
    }

    private ProviderProperties.Asr endpoint() {
        ProviderProperties.Asr endpoint = new ProviderProperties.Asr();
        endpoint.setUrl("ws://127.0.0.1:" + server.port() + "/asr?mode=manual");
        endpoint.setApiKey("fixture-asr-secret");
        endpoint.setModel("fixture-asr");
        return endpoint;
    }

    private DisposableServer server(boolean failTask) {
        return HttpServer.create()
                .port(0)
                .handle(
                        (request, response) -> {
                            authorization.set(request.requestHeaders().get("Authorization"));
                            return response.sendWebsocket(
                                    (input, output) -> {
                                        input.withConnection(
                                                connection ->
                                                        connection
                                                                .onDispose()
                                                                .doFinally(
                                                                        signal ->
                                                                                disconnected
                                                                                        .countDown())
                                                                .subscribe());
                                        return output.sendString(
                                                        input.aggregateFrames().receiveFrames()
                                                                .map(
                                                                        frame -> {
                                                                            if (frame
                                                                                    instanceof
                                                                                    BinaryWebSocketFrame
                                                                                            binary) {
                                                                                audioBytes
                                                                                        .addAndGet(
                                                                                                binary.content()
                                                                                                        .readableBytes());
                                                                                return "";
                                                                            }
                                                                            return frame
                                                                                            instanceof
                                                                                            TextWebSocketFrame
                                                                                                    text
                                                                                    ? reply(
                                                                                            text
                                                                                                    .text(),
                                                                                            failTask)
                                                                                    : "";
                                                                        })
                                                                .filter(text -> !text.isEmpty()))
                                                .then();
                                    });
                        })
                .bindNow();
    }

    private String reply(String text, boolean failTask) {
        JsonNode request = json.parse(text);
        requests.add(request);
        if (request.has("type")) {
            if (failTask) return "{\"type\":\"error\",\"error\":{\"code\":\"InvalidApiKey\"}}";
            return switch (request.path("type").asText()) {
                case "session.update" -> "{\"type\":\"session.updated\"}";
                case "input_audio_buffer.append" -> {
                    audioBytes.addAndGet(java.util.Base64.getDecoder().decode(request.path("audio").asText()).length);
                    yield "";
                }
                case "session.finish" -> "{\"type\":\"session.finished\"}";
                default -> throw new AssertionError("Unexpected event");
            };
        }
        String action = request.path("header").path("action").asText();
        boolean missingAudio = action.equals("finish-task") && audioBytes.get() == 0;
        String event =
                failTask || missingAudio
                        ? "task-failed"
                        : (action.equals("run-task") ? "task-started" : "task-finished");
        return json.encode(
                Map.of(
                        "header",
                        Map.of(
                                "event",
                                event,
                                "task_id",
                                request.path("header").path("task_id").asText(),
                                "error",
                                "provider-private-error"),
                        "payload",
                        Map.of()));
    }
}
