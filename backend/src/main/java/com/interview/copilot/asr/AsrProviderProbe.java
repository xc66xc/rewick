package com.interview.copilot.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderJson;
import com.interview.copilot.ai.ProviderProperties;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.nio.ByteBuffer;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Component;

@Component
public final class AsrProviderProbe {
    private final ProviderJson json;
    private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(3)).build();

    public AsrProviderProbe(ProviderJson json) { this.json = json; }

    public void test(ProviderProperties.Asr endpoint) {
        if (!endpoint.isEnabled()) { throw ProviderErrors.unavailable(); }
        ProbeListener listener = new ProbeListener(endpoint.getModel());
        CompletableFuture<WebSocket> connecting = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(3))
                .header("Authorization", "Bearer " + endpoint.getApiKey()).buildAsync(URI.create(endpoint.getUrl()), listener);
        try {
            connecting.thenCompose(socket -> listener.finished).get(10, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw ProviderErrors.failed();
        } catch (ExecutionException | TimeoutException error) { throw ProviderErrors.failed(); }
        finally {
            connecting.cancel(true);
            listener.close();
        }
    }

    @PreDestroy public void shutdown() { client.shutdownNow(); }

    private final class ProbeListener implements WebSocket.Listener {
        private final String id = UUID.randomUUID().toString();
        private final String model;
        private final CompletableFuture<Void> finished = new CompletableFuture<>();
        private final StringBuilder buffer = new StringBuilder();
        private volatile WebSocket socket;
        private boolean started;
        private int events;

        private ProbeListener(String model) { this.model = model; }

        @Override public void onOpen(WebSocket webSocket) {
            socket = webSocket;
            if (finished.isDone()) { webSocket.abort(); return; }
            Map<String, Object> input = Map.of("payload", Map.of("parameters", Map.of("format", "pcm", "sample_rate", 16000), "input", Map.of()));
            send(json.encode(AsrProtocol.run(json.parse(json.encode(input)), id, model)));
            webSocket.request(1);
        }

        @Override public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            if (buffer.length() + data.length() > 8192) { fail(); return CompletableFuture.completedFuture(null); }
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
                if (++events > 8 || !id.equals(frame.path("header").path("task_id").asText())) { fail(); return; }
                String event = frame.path("header").path("event").asText();
                if ("task-started".equals(event) && !started) {
                    started = true;
                    sendProbeAudio();
                    return;
                }
                if ("task-finished".equals(event) && started) { finished.complete(null); return; }
                if (!"result-generated".equals(event) || !started) { fail(); }
            } catch (RuntimeException error) { fail(); }
        }

        private void sendProbeAudio() {
            // Half a second of mono 16-bit PCM at 16 kHz; never uses microphone data.
            socket.sendBinary(ByteBuffer.allocate(16000), true).whenComplete((value, error) -> {
                if (error != null) { fail(); return; }
                if (!finished.isDone()) { send(json.encode(AsrProtocol.finish(id))); }
            });
        }

        private void send(String message) {
            socket.sendText(message, true).whenComplete((value, error) -> { if (error != null) { fail(); } });
        }
        @Override public void onError(WebSocket webSocket, Throwable error) { fail(); }
        @Override public CompletionStage<?> onClose(WebSocket webSocket, int status, String reason) {
            if (!finished.isDone()) { fail(); }
            return CompletableFuture.completedFuture(null);
        }
        private void fail() { finished.completeExceptionally(ProviderErrors.failed()); close(); }
        private void close() {
            finished.completeExceptionally(ProviderErrors.failed());
            if (socket != null) { socket.abort(); }
        }
    }
}
