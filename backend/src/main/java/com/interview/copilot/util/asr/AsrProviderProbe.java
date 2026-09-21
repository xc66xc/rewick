package com.interview.copilot.util.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.model.asr.LiveTranslateSession;

import jakarta.annotation.PreDestroy;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 校验语音协议配置并验证实时语音服务的完整生命周期。
 */
@Component
public final class AsrProviderProbe {
    private final ProviderJson json;
    private final HttpClient client =
            HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .connectTimeout(Duration.ofSeconds(3))
                    .build();

    public AsrProviderProbe(ProviderJson json) {
        this.json = json;
    }

    public void test(ProviderProperties.Asr endpoint) {
        if (!endpoint.isEnabled()) {
            throw ProviderErrors.unavailable();
        }
        ProbeListener listener = new ProbeListener(endpoint.getModel());
        CompletableFuture<WebSocket> connecting =
                client.newWebSocketBuilder()
                        .connectTimeout(Duration.ofSeconds(3))
                        .header("Authorization", "Bearer " + endpoint.getApiKey())
                        .buildAsync(LiveTranslateSession.endpoint(endpoint.getUrl(), endpoint.getModel()), listener);
        try {
            connecting.thenCompose(socket -> listener.finished).get(10, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw ProviderErrors.failed();
        } catch (ExecutionException | TimeoutException error) {
            throw ProviderErrors.failed();
        } finally {
            connecting.cancel(true);
            listener.close();
        }
    }

    @PreDestroy
    public void shutdown() {
        client.shutdownNow();
    }

    private final class ProbeListener implements WebSocket.Listener {
        private final String id = UUID.randomUUID().toString();
        private final String model;
        private final LiveTranslateSession realtime;
        private final CompletableFuture<Void> finished = new CompletableFuture<>();
        private final StringBuilder buffer = new StringBuilder();
        private volatile WebSocket socket;
        private boolean started;
        private int events;

        private ProbeListener(String model) {
            this.model = model;
            this.realtime = LiveTranslateSession.MODEL.equals(model) ? new LiveTranslateSession() : null;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            socket = webSocket;
            if (finished.isDone()) {
                webSocket.abort();
                return;
            }
            Map<String, Object> input =
                    Map.of(
                            "payload",
                            Map.of(
                                    "parameters",
                                    Map.of("format", "pcm", "sample_rate", 16000),
                                    "input",
                                    Map.of()));
            send(json.encode(realtime == null ? AsrProtocol.run(json.parse(json.encode(input)), id, model) : realtime.run()));
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            if (buffer.length() + data.length() > 8192) {
                fail();
                return CompletableFuture.completedFuture(null);
            }
            buffer.append(data);
            if (last) {
                receive(buffer.toString());
                buffer.setLength(0);
            }
            webSocket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        private void receive(String text) {
            try {
                JsonNode frame = json.parse(text);
                if (realtime != null) {
                    var normalized = realtime.receive(frame, id);
                    if (normalized.isEmpty()) return;
                    frame = normalized.get();
                }
                if (++events > 8 || !id.equals(frame.path("header").path("task_id").asText())) {
                    fail();
                    return;
                }
                String event = frame.path("header").path("event").asText();
                if ("task-started".equals(event) && !started) {
                    started = true;
                    sendProbeAudio();
                    return;
                }
                if ("task-finished".equals(event) && started) {
                    finished.complete(null);
                    return;
                }
                if (!"result-generated".equals(event) || !started) {
                    fail();
                }
            } catch (RuntimeException error) {
                fail();
            }
        }

        private void sendProbeAudio() {
            // Half a second of mono 16-bit PCM at 16 kHz; never uses microphone data.
            CompletableFuture<WebSocket> sending = realtime == null
                    ? socket.sendBinary(ByteBuffer.allocate(16000), true)
                    : socket.sendText(json.encode(realtime.audio(ByteBuffer.allocate(16000))), true);
            sending.whenComplete(
                            (value, error) -> {
                                if (error != null) {
                                    fail();
                                    return;
                                }
                                if (!finished.isDone()) {
                                    send(json.encode(realtime == null ? AsrProtocol.finish(id) : realtime.finish()));
                                }
                            });
        }

        private void send(String message) {
            socket.sendText(message, true)
                    .whenComplete(
                            (value, error) -> {
                                if (error != null) {
                                    fail();
                                }
                            });
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            fail();
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int status, String reason) {
            if (!finished.isDone()) {
                fail();
            }
            return CompletableFuture.completedFuture(null);
        }

        private void fail() {
            finished.completeExceptionally(ProviderErrors.failed());
            close();
        }

        private void close() {
            finished.completeExceptionally(ProviderErrors.failed());
            if (socket != null) {
                socket.abort();
            }
        }
    }
}
