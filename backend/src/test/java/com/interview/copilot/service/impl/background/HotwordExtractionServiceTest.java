package com.interview.copilot.service.impl.background;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.service.background.HotwordSourceService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.Map;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class HotwordExtractionServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final HotwordSourceService sources = mock(HotwordSourceService.class);
    private final PlatformRuntimeService runtime = mock(PlatformRuntimeService.class);
    private final ProviderHttpClient http = mock(ProviderHttpClient.class);
    private final HotwordExtractionServiceImpl service = new HotwordExtractionServiceImpl(sources, runtime, http, json);

    private void configure() {
        var snapshot = mock(PlatformSnapshot.class);
        var config = new ProviderProperties.Llm();
        config.setModel("test");
        config.setUrl("https://api.deepseek.com/chat/completions");
        config.setMaxConcurrent(2);
        config.setTotalTimeoutSeconds(30);
        config.setMaxOutputTokens(1024);
        when(runtime.snapshot()).thenReturn(snapshot);
        when(snapshot.llm(null)).thenReturn(new PlatformSnapshot.LlmSelection("model", config));
        when(sources.read(7, null, null, List.of())).thenReturn("虚拟量测 Agent");
    }

    @Test
    void extract_validResponse_discardsInventedTerms() throws Exception {
        configure();
        var response = json.createObjectNode();
        response.putArray("choices").addObject().putObject("message").put("content",
                "{\"hotwords\":[\"Agent\",\"虚拟量测\",\"编造术语\"]}");
        when(http.json(any(), any(), any())).thenReturn(Mono.just(response));
        assertThat(service.extract(7, null, null, List.of())).containsExactly("Agent", "虚拟量测");
    }

    @Test
    void extract_invalidResponse_reportsFailure() {
        configure();
        when(http.json(any(), any(), any())).thenReturn(Mono.just(json.createObjectNode()));
        assertThatThrownBy(() -> service.extract(7, null, null, List.of())).isInstanceOf(ApiException.class);
    }

    @Test
    void extract_deepseekRequest_disablesThinkingToReserveOutputForTerms() {
        configure();
        var response = json.createObjectNode();
        response.putArray("choices").addObject().putObject("message")
                .put("content", "{\"hotwords\":[\"Agent\"]}");
        when(http.json(any(), any(), any())).thenReturn(Mono.just(response));

        assertThat(service.extract(7, null, null, List.of())).containsExactly("Agent");

        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(http).json(any(), body.capture(), any());
        assertThat(body.getValue()).containsEntry("thinking", Map.of("type", "disabled"));
    }

    @Test
    void extract_truncatedThinkingOnlyResponse_reportsOutputLimit() {
        configure();
        var response = json.createObjectNode();
        response.putArray("choices").addObject().put("finish_reason", "length")
                .putObject("message").put("content", "").put("reasoning_content", "private reasoning");
        when(http.json(any(), any(), any())).thenReturn(Mono.just(response));

        assertThatThrownBy(() -> service.extract(7, null, null, List.of()))
                .isInstanceOf(ApiException.class).hasMessageContaining("被截断")
                .hasMessageNotContaining("private reasoning");
    }
}
