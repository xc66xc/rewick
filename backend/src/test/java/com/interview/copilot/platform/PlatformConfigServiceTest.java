package com.interview.copilot.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;

import com.interview.copilot.common.ApiException;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class PlatformConfigServiceTest {
    private final PlatformConfigFixture fixture = new PlatformConfigFixture();

    @AfterEach void close() { fixture.close(); }

    @Test void publish_secretIsEncrypted_andResponseNeverSerializesApiKey() throws Exception {
        PlatformConfig saved = fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));

        assertThat(saved.version()).isEqualTo(1);
        assertThat(fixture.row.get().payload()).contains("v1:").doesNotContain("fixture-secret");
        assertThat(fixture.json.writeValueAsString(saved)).contains("\"hasApiKey\":true").doesNotContain("\"apiKey\"", "fixture-secret", "encryptedKey");
        verify(fixture.audit).record(1, "platform.config.publish", "version:1");
    }

    @Test void reload_savedConfiguration_restoresModelRoutingAndSecret() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));

        var route = fixture.service(PlatformConfigFixture.MASTER_KEY).snapshot().llm("careful");

        assertThat(route.config().getModel()).isEqualTo("upstream-careful");
        assertThat(route.config().getMaxOutputTokens()).isEqualTo(2000);
        assertThat(route.config().getApiKey()).isEqualTo("fixture-secret");
    }

    @Test void publish_omittedKey_keepsSecretForSameProvider() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));
        fixture.service.publish(1, PlatformConfigFixture.config(1, null));

        assertThat(fixture.service.snapshot().llm("fast").config().getApiKey()).isEqualTo("fixture-secret");
    }

    @Test void publish_outdatedVersion_doesNotReplaceCurrentConfiguration() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "first-secret"));

        assertThatThrownBy(() -> fixture.service.publish(1, PlatformConfigFixture.config(0, "second-secret")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CONFIG_VERSION_CONFLICT");
        assertThat(fixture.service.snapshot().llm("fast").config().getApiKey()).isEqualTo("first-secret");
    }

    @Test void publish_disabledConfiguration_doesNotFallBackToEnvironment() {
        fixture.environment.getLlm().setUrl("https://legacy.invalid/chat");
        fixture.environment.getLlm().setApiKey("legacy-secret");
        fixture.environment.getLlm().setModel("legacy-model");
        assertThat(fixture.service.snapshot().availableModels()).isEmpty();

        fixture.service.publish(1, PlatformConfigFixture.empty(0));

        assertThat(fixture.service.snapshot().availableModels()).isEmpty();
        assertThatThrownBy(() -> fixture.service.snapshot().llm(null)).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("CAPABILITY_UNAVAILABLE");
    }

    @Test void draft_changedAddressWithoutNewKey_rejectsAccidentalCredentialForwarding() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));
        PlatformConfig draft = PlatformConfigFixture.config(1, null);
        var provider = new PlatformConfig.Provider("primary", "改地址", "llm", "https://changed.invalid/chat", true, true, null);

        assertThatThrownBy(() -> fixture.service.draft(new PlatformConfig(1, List.of(provider), draft.models(),
                draft.defaultModelId(), draft.asr(), draft.knowledge()))).isInstanceOf(ApiException.class)
                .hasMessage("服务地址或类型变更后，请重新填写 API Key。");
    }

    @Test void draft_enabledNewProviderWithoutKey_rejectsConfiguration() {
        assertThatThrownBy(() -> fixture.service.draft(PlatformConfigFixture.config(0, null)))
                .isInstanceOf(ApiException.class).hasMessage("启用提供商前请填写 API Key。");
    }

    @Test void publish_missingMasterKey_doesNotPersistPlaintextOrEnableConfig() {
        assertThatThrownBy(() -> fixture.service("").publish(1, PlatformConfigFixture.config(0, "fixture-secret")))
                .isInstanceOf(ApiException.class);
        assertThat(fixture.row.get().published()).isFalse();
        assertThat(fixture.row.get().payload()).isEqualTo("{}");
    }

    @Test void snapshot_missingMasterKeyAfterPublication_failsClosedInsteadOfUsingEnvironment() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));
        fixture.environment.getLlm().setUrl("https://legacy.invalid/chat");
        fixture.environment.getLlm().setApiKey("legacy-secret");
        fixture.environment.getLlm().setModel("legacy-model");

        assertThatThrownBy(() -> fixture.service("").snapshot()).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("PLATFORM_SECRET_UNAVAILABLE");
    }

    @Test void draft_nullArrayElement_returnsSafeValidationError() {
        PlatformConfig draft = new PlatformConfig(0, Arrays.asList((PlatformConfig.Provider) null), List.of(), "",
                new PlatformConfig.Asr(false, "", ""), new PlatformConfig.Knowledge(false, "", ""));

        assertThatThrownBy(() -> fixture.service.draft(draft)).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("INVALID_PLATFORM_CONFIG");
    }

    @Test void unpublishedConfiguration_doesNotImportEnvironmentEndpointsOrKeys() {
        fixture.environment.getLlm().setUrl("https://legacy.invalid/chat");
        fixture.environment.getLlm().setApiKey("legacy-secret");
        fixture.environment.getLlm().setModel("organization/model-v1");
        PlatformConfig draft = fixture.service.get();

        assertThat(draft.providers()).isEmpty();
        assertThat(draft.models()).isEmpty();
        assertThat(draft.defaultModelId()).isEmpty();
        assertThatThrownBy(() -> fixture.service.snapshot().llm("organization/model-v1"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MODEL_UNAVAILABLE");
    }

    @Test void deserialize_writeOnlyKey_isAcceptedWhileReadOnlyFlagIsIgnored() throws Exception {
        String body = "{\"id\":\"primary\",\"name\":\"test\",\"kind\":\"llm\",\"url\":\"https://provider.invalid\",\"enabled\":true,\"hasApiKey\":true,\"apiKey\":\"fixture-secret\"}";

        PlatformConfig.Provider provider = fixture.json.readValue(body, PlatformConfig.Provider.class);

        assertThat(provider.apiKey()).isEqualTo("fixture-secret");
        assertThat(provider.hasApiKey()).isFalse();
        assertThat(fixture.json.writeValueAsString(provider)).doesNotContain("fixture-secret", "\"apiKey\"");
    }
}
