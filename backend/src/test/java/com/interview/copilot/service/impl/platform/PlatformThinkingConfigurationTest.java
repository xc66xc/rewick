package com.interview.copilot.service.impl.platform;

import static org.assertj.core.api.Assertions.*;
import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformConfig;
import java.util.List;
import org.junit.jupiter.api.Test;

class PlatformThinkingConfigurationTest {
    @Test
    void publish_readReloadAndDraft_preserveModelModesWithoutExposingSecrets() {
        try (var fixture = new PlatformConfigFixture()) {
            var original = PlatformConfigFixture.config(0, "test-only-secret");
            var first = original.models().getFirst();
            var enabled = new PlatformConfig.Model(first.id(), first.name(), first.providerId(), first.model(), true, 2048, "enabled", "bailian");
            var input = new PlatformConfig(0, original.providers(), List.of(enabled), enabled.id(), original.asr());
            fixture.service.publish(1, input);
            var reloaded = fixture.service(PlatformConfigFixture.MASTER_KEY);
            assertThat(reloaded.get().models().getFirst().thinkingMode()).isEqualTo("enabled");
            assertThat(reloaded.snapshot().llm(null).config().getThinkingProtocol()).isEqualTo("bailian");
            assertThat(fixture.row.get().payload()).contains("thinkingMode", "thinkingProtocol").doesNotContain("test-only-secret");
            assertThat(reloaded.draft(reloaded.get()).llm(null).config().getThinkingMode()).isEqualTo("enabled");
        }
    }

    @Test
    void legacy_missingFields_preservesDeepSeekDisableAndOtherDefaults() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var config = mapper.readValue("""
                {"version":0,"providers":[{"id":"p","name":"p","kind":"llm","url":"https://api.deepseek.com/chat/completions","enabled":true}],
                "models":[{"id":"m","name":"m","providerId":"p","model":"m","enabled":true,"maxOutputTokens":2048}],
                "defaultModelId":"m","asr":{"enabled":false,"providerId":"","model":""}}
                """, PlatformConfig.class);
        assertThat(config.models().getFirst().thinkingMode()).isEqualTo("disabled");
        assertThat(config.models().getFirst().thinkingProtocol()).isEqualTo("deepseek");
        var other = mapper.readValue(mapper.writeValueAsString(config).replace("api.deepseek.com", "dashscope.aliyuncs.com")
                .replace("\"thinkingMode\":\"disabled\",", "").replace(",\"thinkingProtocol\":\"deepseek\"", ""), PlatformConfig.class);
        assertThat(other.models().getFirst().thinkingMode()).isEqualTo("default");
        assertThat(other.models().getFirst().thinkingProtocol()).isEqualTo("bailian");
    }

    @Test
    void publish_explicitToggleWithoutProtocol_rejectsBeforeChangingVersion() {
        try (var fixture = new PlatformConfigFixture()) {
            var config = PlatformConfigFixture.config(0, "test-only-secret");
            var model = config.models().getFirst();
            var invalid = new PlatformConfig.Model(model.id(), model.name(), model.providerId(), model.model(), true, 2048, "enabled", "none");
            var input = new PlatformConfig(0, config.providers(), List.of(invalid), invalid.id(), config.asr());
            assertThatThrownBy(() -> fixture.service.publish(1, input)).isInstanceOf(ApiException.class).hasMessageContaining("思考参数协议");
            assertThat(fixture.row.get().version()).isZero();
        }
    }
}
