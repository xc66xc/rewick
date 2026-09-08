package com.interview.copilot.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.ApiException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LlmRequestPolicyTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(strings = {"url", "api_key", "requestId", "thinking", "tools"})
    void request_unapprovedField_rejects(String field) {
        var request = mapper.valueToTree(Map.of("messages", List.of(Map.of("role", "user", "content", "hi")), field, "malicious"));
        assertThatThrownBy(() -> LlmRequestPolicy.request(request, config())).isInstanceOf(ApiException.class);
    }

    @Test
    void request_oversizedOutput_clampsAndPreservesPersonalContext() {
        var request = mapper.valueToTree(Map.of("messages", List.of(Map.of("role", "user", "content", "x".repeat(150000))), "max_tokens", 900000));
        Map<String, Object> result = LlmRequestPolicy.request(request, config());
        assertThat(result).containsEntry("max_tokens", 2048).containsEntry("model", "platform-model");
    }

    @Test
    void request_unknownModel_rejects() {
        var request = mapper.valueToTree(Map.of("model", "expensive-unapproved", "messages", List.of(Map.of("role", "user", "content", "hi"))));
        assertThatThrownBy(() -> LlmRequestPolicy.request(request, config())).isInstanceOf(ApiException.class);
    }

    @Test
    void request_controlledDeepSeekEndpoint_disablesThinking() {
        var settings = config();
        settings.setUrl("https://api.deepseek.com/chat/completions");
        var request = mapper.valueToTree(Map.of("messages", List.of(Map.of("role", "user", "content", "hi"))));
        assertThat(LlmRequestPolicy.request(request, settings)).containsEntry("thinking", Map.of("type", "disabled"));
    }

    @Test
    void request_tooManyMessages_rejects() {
        var request = mapper.valueToTree(Map.of("messages", java.util.Collections.nCopies(41, Map.of("role", "user", "content", "hi"))));
        assertThatThrownBy(() -> LlmRequestPolicy.request(request, config())).isInstanceOf(ApiException.class);
    }

    private ProviderProperties.Llm config() {
        ProviderProperties.Llm config = new ProviderProperties.Llm();
        config.setModel("platform-model");
        config.setUrl("https://example.com/completions");
        return config;
    }
}
