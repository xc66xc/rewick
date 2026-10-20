package com.interview.copilot.validation.ai;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class LlmThinkingPolicyTest {
    private final ObjectMapper json = new ObjectMapper();

    @ParameterizedTest
    @CsvSource({"bailian,enabled,true", "bailian,disabled,false", "deepseek,enabled,enabled", "deepseek,disabled,disabled"})
    void request_platformMode_usesOnlySelectedProtocol(String protocol, String mode, String expected) {
        var config = endpoint(protocol, mode);
        var result = LlmRequestPolicy.request(input(), config);
        if (protocol.equals("bailian")) {
            assertThat(result).containsEntry("enable_thinking", Boolean.valueOf(expected)).doesNotContainKey("thinking");
        } else {
            assertThat(result).containsEntry("thinking", Map.of("type", expected)).doesNotContainKey("enable_thinking");
        }
    }

    @ParameterizedTest
    @CsvSource({"bailian", "deepseek", "none"})
    void request_defaultMode_omitsBothParameters(String protocol) {
        assertThat(LlmRequestPolicy.request(input(), endpoint(protocol, "default")))
                .doesNotContainKeys("thinking", "enable_thinking");
    }

    @Test
    void auxiliary_enabledAnswerModel_explicitlyDisablesThinking() {
        assertThat(LlmRequestPolicy.auxiliary(input(), endpoint("bailian", "enabled")))
                .containsEntry("enable_thinking", false);
    }

    @Test
    void request_unknownProtocolOrMode_rejects() {
        assertThatThrownBy(() -> LlmRequestPolicy.request(input(), endpoint("none", "enabled"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> LlmRequestPolicy.request(input(), endpoint("other", "default"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> LlmRequestPolicy.request(input(), endpoint("bailian", "auto"))).isInstanceOf(ApiException.class);
    }

    @ParameterizedTest
    @CsvSource({"https://api.deepseek.com/chat/completions,deepseek", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions,bailian",
        "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions,bailian", "https://dashscope.aliyuncs.com.attacker.test/x,none", "https://notapi.deepseek.com/x,none"})
    void suggestProtocol_knownHostOnly_doesNotTrustModelNames(String url, String protocol) {
        assertThat(LlmThinkingPolicy.suggestProtocol(url)).isEqualTo(protocol);
    }

    private com.fasterxml.jackson.databind.JsonNode input() {
        return json.valueToTree(Map.of("messages", List.of(Map.of("role", "user", "content", "hi"))));
    }
    private ProviderProperties.Llm endpoint(String protocol, String mode) {
        var endpoint = new ProviderProperties.Llm();
        endpoint.setModel("m"); endpoint.setUrl("https://gateway.example.test/chat/completions");
        endpoint.setThinkingProtocol(protocol); endpoint.setThinkingMode(mode);
        return endpoint;
    }
}
