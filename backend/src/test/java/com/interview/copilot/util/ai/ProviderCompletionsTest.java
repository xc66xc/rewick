package com.interview.copilot.util.ai;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderFailure;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

class ProviderCompletionsTest {
    private final ProviderHttpClient http = mock(ProviderHttpClient.class);
    private final ProviderJson json = new ProviderJson(new ObjectMapper());
    private final Map<String, Object> body = Map.of("model", "m", "stream", false, "enable_thinking", true);

    @Test
    void complete_reasoningThenContent_returnsOnlyAnswerAndReportedUsage() {
        when(http.stream(any(), anyMap())).thenReturn(Flux.just(event("{\"choices\":[{\"delta\":{\"reasoning_content\":\"private reasoning\"}}]}"),
                event(delta("答案")), event("{\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":10,\"total_tokens\":15}}"), event("[DONE]")));
        var result = ProviderCompletions.complete(http, json, endpoint(), body, Duration.ofSeconds(2)).block();
        assertThat(result.path("choices").path(0).path("message").path("content").asText()).isEqualTo("答案");
        assertThat(result.path("usage").path("completion_tokens").asInt()).isEqualTo(10);
        assertThat(result.toString()).doesNotContain("private reasoning", "reasoning_content");
        verify(http).stream(any(), argThat(sent -> Boolean.TRUE.equals(sent.get("stream")) && Boolean.TRUE.equals(sent.get("enable_thinking"))));
        verify(http, never()).json(any(), anyMap(), any());
    }

    @Test
    void probe_firstAnswer_cancelsWithoutWaitingForEndOrUsage() {
        var cancelled = new AtomicBoolean();
        when(http.stream(any(), anyMap())).thenReturn(Flux.concat(Flux.just(event(delta("OK"))), Flux.<ServerSentEvent<String>>never()).doOnCancel(() -> cancelled.set(true)));
        var result = ProviderCompletions.probe(http, json, endpoint(), body, Duration.ofSeconds(1)).block();
        assertThat(result.path("choices").path(0).path("message").path("content").asText()).isEqualTo("OK");
        assertThat(cancelled).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"reasoning-only", "length", "incomplete", "oversized", "error", "invalid-json"})
    void complete_invalidOrTruncatedStream_rejects(String scenario) {
        List<String> data = switch (scenario) {
            case "reasoning-only" -> List.of("{\"choices\":[{\"delta\":{\"reasoning_content\":\"secret\"}}]}", "[DONE]");
            case "length" -> List.of(delta("答案"), "{\"choices\":[{\"delta\":{},\"finish_reason\":\"length\"}]}", "[DONE]");
            case "incomplete" -> List.of(delta("未完成"));
            case "oversized" -> List.of(delta("x".repeat(32001)), delta("x".repeat(32001)), "[DONE]");
            case "error" -> List.of("{\"error\":{\"message\":\"private-key-secret\"}}");
            default -> List.of("bad-json-secret");
        };
        when(http.stream(any(), anyMap())).thenReturn(Flux.fromIterable(data).map(this::event));
        assertThatThrownBy(() -> ProviderCompletions.complete(http, json, endpoint(), body, Duration.ofSeconds(1)).block())
                .isInstanceOf(ProviderFailure.class).hasMessageNotContaining("private-key-secret").hasMessageNotContaining("bad-json-secret");
    }

    @Test
    void complete_stalledStream_timesOutAndCancels() {
        var cancelled = new AtomicBoolean();
        when(http.stream(any(), anyMap())).thenReturn(Flux.<ServerSentEvent<String>>never().doOnCancel(() -> cancelled.set(true)));
        assertThatThrownBy(() -> ProviderCompletions.complete(http, json, endpoint(), body, Duration.ofMillis(30)).block())
                .isInstanceOf(ProviderFailure.class).hasMessageContaining("超时");
        assertThat(cancelled).isTrue();
    }

    @Test
    void complete_disabledMode_keepsNonStreamingProtocol() {
        var endpoint = endpoint(); endpoint.setThinkingMode("disabled");
        when(http.json(any(), anyMap(), any())).thenReturn(Mono.just(json.parse("{}")));
        ProviderCompletions.complete(http, json, endpoint, body, Duration.ofSeconds(1)).block();
        verify(http, never()).stream(any(), anyMap());
    }

    private ProviderProperties.Llm endpoint() {
        var endpoint = new ProviderProperties.Llm(); endpoint.setUrl("http://localhost/chat/completions");
        endpoint.setModel("m"); endpoint.setThinkingMode("enabled"); endpoint.setThinkingProtocol("bailian"); return endpoint;
    }
    private ServerSentEvent<String> event(String data) { return ServerSentEvent.builder(data).build(); }
    private String delta(String text) { return json.encode(Map.of("choices", List.of(Map.of("delta", Map.of("content", text))))); }
}
