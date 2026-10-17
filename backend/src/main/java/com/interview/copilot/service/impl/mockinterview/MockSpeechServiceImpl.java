package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.util.mockinterview.TtsListener;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.mockinterview.MockSpeechService;
import com.interview.copilot.util.ai.ProviderJson;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** CosyVoice duplex synthesis; no credentials leave this service. */
@Service
public class MockSpeechServiceImpl implements MockSpeechService {
    private final ProviderJson json;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    public MockSpeechServiceImpl(ProviderJson json) { this.json = json; }
    @jakarta.annotation.PreDestroy public void close() { client.shutdownNow(); }

    public void stream(JsonNode runtime, String text, String voiceId, Consumer<byte[]> audio, BooleanSupplier cancelled) {
        JsonNode config = runtime.path("tts");
        validate(config, text, voiceId);
        String taskId = UUID.randomUUID().toString();
        TtsListener listener = new TtsListener(json, taskId, audio);
        WebSocket socket = null;
        try {
            socket = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + config.path("apiKey").asText())
                    .buildAsync(URI.create(config.path("endpoint").asText()), listener).get(12, TimeUnit.SECONDS);
            socket.sendText(json.encode(Map.of("header", header("run-task", taskId), "payload", Map.of(
                    "task_group", "audio", "task", "tts", "function", "SpeechSynthesizer",
                    "model", config.path("model").asText(), "parameters", Map.of("text_type", "PlainText",
                    "voice", voiceId, "format", "pcm", "sample_rate", 24000), "input", Map.of()))), true).join();
            await(listener.started, cancelled, 10);
            socket.sendText(json.encode(Map.of("header", header("continue-task", taskId), "payload", Map.of("input", Map.of("text", text)))), true).join();
            socket.sendText(json.encode(Map.of("header", header("finish-task", taskId), "payload", Map.of("input", Map.of()))), true).join();
            await(listener.finished, cancelled, 90);
        } catch (java.util.concurrent.CancellationException error) {
            throw error;
        } catch (Exception error) {
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            LoggerFactory.getLogger(getClass()).warn("Mock TTS failed task={} type={}", taskId, error.getClass().getSimpleName());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "MOCK_TTS_FAILED", "语音合成失败，请暂停后重试或检查语音配置。");
        } finally { if (socket != null) socket.abort(); }
    }

    private void validate(JsonNode config, String text, String voice) {
        ProviderProperties.Asr endpoint = new ProviderProperties.Asr();
        endpoint.setUrl(config.path("endpoint").asText()); endpoint.setApiKey(config.path("apiKey").asText());
        if (!endpoint.isEnabled() || !java.util.Set.of("wss", "ws").contains(URI.create(endpoint.getUrl()).getScheme())
                || text == null || text.isBlank() || text.length() > 2000 || voice == null || voice.isBlank())
            throw new ApiException(HttpStatus.BAD_REQUEST, "MOCK_TTS_UNAVAILABLE", "请在管理端配置有效的TTS地址、模型、Key和音色。");
    }

    private static Map<String, String> header(String action, String taskId) {
        return Map.of("action", action, "task_id", taskId, "streaming", "duplex");
    }
    private static void await(CompletableFuture<Void> future, BooleanSupplier cancelled, int seconds) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < until) {
            if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException();
            try { future.get(100, TimeUnit.MILLISECONDS); return; } catch (TimeoutException ignored) { /* poll cancellation */ }
        }
        throw new TimeoutException("TTS phase deadline");
    }
}
