package com.interview.copilot.service.impl.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.entity.platform.PlatformConfigRow;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.request.platform.PlatformConfigRequest;
import com.interview.copilot.util.rerank.BailianRerankProtocol;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

class PlatformRerankConfigTest {
    private final PlatformConfigFixture fixture = new PlatformConfigFixture();

    @AfterEach
    void close() {
        fixture.close();
    }

    @Test
    void publish_enabledRerank_encryptsKeyAndPreservesBindingInEveryPublishedView() {
        var saved = fixture.service.publish(1, config(0, true, "fixture-rerank-key", "qwen3-rerank", 1500));

        assertThat(saved.rerank()).isEqualTo(fixture.service.get().rerank());
        assertThat(saved.rerank().enabled()).isTrue();
        assertThat(fixture.row.get().payload()).doesNotContain("fixture-rerank-key");
        assertThat(fixture.service.snapshot().rerank().apiKey()).isEqualTo("fixture-rerank-key");
        assertThat(fixture.service.snapshot().rerank().enabled()).isTrue();
        assertThat(saved.providers().getFirst().apiKey()).isNull();
    }

    @Test
    void publish_oldAdminOmitsRerank_preservesCurrentConfigurationAndEncryptedKey() throws Exception {
        var saved = fixture.service.publish(1, config(0, true, "fixture-rerank-key", "qwen3-rerank", 1200));
        var request = new PlatformConfigRequest(1, saved.providers(), saved.models(), saved.defaultModelId(),
                saved.asr(), saved.embedding(), saved.webSearch(), saved.screenshotModelId());
        var admin = new AdminPlatformConfigServiceImpl(fixture.service);

        var response = admin.publish(1, request);

        assertThat(request.rerank()).isNull();
        assertThat(response.rerank()).isEqualTo(saved.rerank());
        assertThat(fixture.service.snapshot().rerank().apiKey()).isEqualTo("fixture-rerank-key");
        assertThat(fixture.row.get().payload()).doesNotContain("fixture-rerank-key");
    }

    @Test
    void get_oldStoredJsonWithoutRerank_defaultsToDisabled() throws Exception {
        fixture.service.publish(1, PlatformConfigFixture.empty(0));
        ObjectNode payload = (ObjectNode) fixture.json.readTree(fixture.row.get().payload());
        payload.remove("rerank");
        fixture.row.set(new PlatformConfigRow(1, true, fixture.json.writeValueAsString(payload)));

        assertThat(fixture.service.get().rerank()).isEqualTo(PlatformConfig.Rerank.disabled());
        assertThat(fixture.service.snapshot().rerank().enabled()).isFalse();
    }

    @Test
    void publish_missingPath_explainsExactNativePathWithoutCompletingUrl() {
        var draft = config(0, true, "fixture-rerank-key", "qwen3-rerank", 1500);
        var original = draft.providers().getFirst();
        var missing = new PlatformConfig.Provider(original.id(), original.name(), original.kind(),
                "https://provider.invalid", true, false, "fixture-rerank-key");
        var input = new PlatformConfig(0, List.of(missing), List.of(), "", draft.asr(), draft.embedding(),
                draft.webSearch(), "", draft.rerank());

        assertThatThrownBy(() -> fixture.service.publish(1, input)).isInstanceOf(ApiException.class)
                .hasMessageContaining(BailianRerankProtocol.PATH);
    }

    @ParameterizedTest
    @ValueSource(ints = {299, 5001})
    void publish_invalidTimeout_rejectsWithoutSaving(int timeout) {
        assertThatThrownBy(() -> fixture.service.publish(1, config(0, true, "key", "qwen3-rerank", timeout)))
                .isInstanceOf(ApiException.class);
        assertThat(fixture.row.get().published()).isFalse();
    }

    @Test
    void publish_unknownModel_rejectsUnregisteredCapacity() {
        assertThatThrownBy(() -> fixture.service.publish(1, config(0, false, "key", "other-rerank", 1500)))
                .isInstanceOf(ApiException.class).hasMessageContaining("qwen3-rerank");
    }

    @Test
    void publish_enabledProviderWithoutKey_rejects() {
        assertThatThrownBy(() -> fixture.service.publish(1, config(0, true, "", "qwen3-rerank", 1500)))
                .isInstanceOf(ApiException.class).hasMessageContaining("API Key");
    }

    private PlatformConfig config(long version, boolean enabled, String key, String model, int timeout) {
        var provider = new PlatformConfig.Provider("rerank", "重排序", "rerank",
                "https://provider.invalid" + BailianRerankProtocol.PATH, true, false, key);
        return new PlatformConfig(version, List.of(provider), List.of(), "", new PlatformConfig.Asr(false, "", ""),
                null, null, "", new PlatformConfig.Rerank(enabled, "rerank", model, timeout));
    }
}
