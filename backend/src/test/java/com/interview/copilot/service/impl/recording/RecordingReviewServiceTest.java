package com.interview.copilot.service.impl.recording;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import reactor.core.publisher.Mono;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RecordingReviewServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final PlatformRuntimeService runtime = mock(PlatformRuntimeService.class);
    private final ProviderHttpClient http = mock(ProviderHttpClient.class);
    private final RecordingReviewServiceImpl service = new RecordingReviewServiceImpl(runtime, http, json);

    private void configure() {
        var snapshot = mock(PlatformSnapshot.class);
        var config = new ProviderProperties.Llm();
        config.setModel("test");
        config.setUrl("https://api.deepseek.com/chat/completions");
        config.setMaxConcurrent(2);
        config.setTotalTimeoutSeconds(120);
        config.setMaxOutputTokens(8192);
        when(runtime.snapshot()).thenReturn(snapshot);
        when(snapshot.llm(null)).thenReturn(new PlatformSnapshot.LlmSelection("model", config));
    }

    @Test
    void summarize_validTranscript_disablesThinkingAndBoundsTimeout() {
        configure();
        var response = json.createObjectNode();
        response.putArray("choices").addObject().putObject("message").put("content", "# 面试复盘");
        when(http.json(any(), any(), any())).thenReturn(Mono.just(response));
        assertThat(service.summarize(7, "真实对话")).isEqualTo("# 面试复盘");
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<Duration> timeout = ArgumentCaptor.forClass(Duration.class);
        verify(http).json(any(), body.capture(), timeout.capture());
        assertThat(body.getValue()).containsEntry("thinking", Map.of("type", "disabled"));
        assertThat(body.getValue().get("messages").toString()).contains("无法确认归属", "真实对话");
        assertThat(timeout.getValue()).isEqualTo(Duration.ofSeconds(120));
    }

    @Test
    void summarize_providerTimeout_exposesOnlySafeError() {
        configure();
        when(http.json(any(), any(), any())).thenReturn(Mono.error(new IllegalStateException("secret provider body")));
        assertThatThrownBy(() -> service.summarize(7, "真实对话"))
                .isInstanceOf(ApiException.class).hasMessageNotContaining("secret");
    }

    @Test
    void summarize_truncatedResponse_doesNotReturnPartialReview() {
        configure();
        var response = json.createObjectNode();
        response.putArray("choices").addObject().put("finish_reason", "length")
                .putObject("message").put("content", "incomplete");
        when(http.json(any(), any(), any())).thenReturn(Mono.just(response));
        assertThatThrownBy(() -> service.summarize(7, "对话")).isInstanceOf(ApiException.class);
    }

    @Test
    void summarize_oversizeOrEmpty_rejectsBeforeProviderCall() {
        assertThatThrownBy(() -> service.summarize(7, "x".repeat(160001))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.summarize(7, " ")).isInstanceOf(ApiException.class);
        verifyNoInteractions(runtime, http);
    }
}
