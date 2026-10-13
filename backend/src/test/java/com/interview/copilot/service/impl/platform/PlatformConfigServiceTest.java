package com.interview.copilot.service.impl.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;

import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformConfig;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

public class PlatformConfigServiceTest {
    private final PlatformConfigFixture fixture = new PlatformConfigFixture();

    @AfterEach
    void close() {
        fixture.close();
    }

    @Test
    void publish_secretIsEncrypted_andResponseNeverSerializesApiKey() throws Exception {
        PlatformConfig saved =
                fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));

        assertThat(saved.version()).isEqualTo(1);
        assertThat(fixture.row.get().payload()).contains("v1:").doesNotContain("fixture-secret");
        assertThat(fixture.json.writeValueAsString(saved))
                .contains("\"hasApiKey\":true")
                .doesNotContain("\"apiKey\"", "fixture-secret", "encryptedKey");
        verify(fixture.audit).record(1, "platform.config.publish", "version:1");
    }

    @Test
    void reload_savedConfiguration_restoresModelRoutingAndSecret() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));

        var route = fixture.service(PlatformConfigFixture.MASTER_KEY).snapshot().llm("careful");

        assertThat(route.config().getModel()).isEqualTo("upstream-careful");
        assertThat(route.config().getMaxOutputTokens()).isEqualTo(2000);
        assertThat(route.config().getApiKey()).isEqualTo("fixture-secret");
    }

    @Test
    void publish_omittedKey_keepsSecretForSameProvider() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));
        fixture.service.publish(1, PlatformConfigFixture.config(1, null));

        assertThat(fixture.service.snapshot().llm("fast").config().getApiKey())
                .isEqualTo("fixture-secret");
    }

    @Test
    void publish_outdatedVersion_doesNotReplaceCurrentConfiguration() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "first-secret"));

        assertThatThrownBy(
                        () ->
                                fixture.service.publish(
                                        1, PlatformConfigFixture.config(0, "second-secret")))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("CONFIG_VERSION_CONFLICT");
        assertThat(fixture.service.snapshot().llm("fast").config().getApiKey())
                .isEqualTo("first-secret");
    }

    @Test
    void publish_disabledConfiguration_doesNotFallBackToEnvironment() {
        fixture.environment.getLlm().setUrl("https://legacy.invalid/chat");
        fixture.environment.getLlm().setApiKey("legacy-secret");
        fixture.environment.getLlm().setModel("legacy-model");
        assertThat(fixture.service.snapshot().availableModels()).isEmpty();

        fixture.service.publish(1, PlatformConfigFixture.empty(0));

        assertThat(fixture.service.snapshot().availableModels()).isEmpty();
        assertThatThrownBy(() -> fixture.service.snapshot().llm(null))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("CAPABILITY_UNAVAILABLE");
    }

    @Test
    void draft_changedAddressWithoutNewKey_rejectsAccidentalCredentialForwarding() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));
        PlatformConfig draft = PlatformConfigFixture.config(1, null);
        var provider =
                new PlatformConfig.Provider(
                        "primary", "改地址", "llm", "https://changed.invalid/chat", true, true, null);

        assertThatThrownBy(
                        () ->
                                fixture.service.draft(
                                        new PlatformConfig(
                                                1,
                                                List.of(provider),
                                                draft.models(),
                                                draft.defaultModelId(),
                                                draft.asr(),
                                                draft.knowledge())))
                .isInstanceOf(ApiException.class)
                .hasMessage("服务地址或类型变更后，请重新填写 API Key。");
    }

    @Test
    void draft_enabledNewProviderWithoutKey_rejectsConfiguration() {
        assertThatThrownBy(() -> fixture.service.draft(PlatformConfigFixture.config(0, null)))
                .isInstanceOf(ApiException.class)
                .hasMessage("启用提供商前请填写 API Key。");
    }

    @Test
    void publish_missingMasterKey_doesNotPersistPlaintextOrEnableConfig() {
        assertThatThrownBy(
                        () ->
                                fixture.service("")
                                        .publish(
                                                1,
                                                PlatformConfigFixture.config(0, "fixture-secret")))
                .isInstanceOf(ApiException.class);
        assertThat(fixture.row.get().published()).isFalse();
        assertThat(fixture.row.get().payload()).isEqualTo("{}");
    }

    @Test
    void snapshot_missingMasterKeyAfterPublication_failsClosedInsteadOfUsingEnvironment() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));
        fixture.environment.getLlm().setUrl("https://legacy.invalid/chat");
        fixture.environment.getLlm().setApiKey("legacy-secret");
        fixture.environment.getLlm().setModel("legacy-model");

        assertThatThrownBy(() -> fixture.service("").snapshot())
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("PLATFORM_SECRET_UNAVAILABLE");
    }

    @Test
    void draft_nullArrayElement_returnsSafeValidationError() {
        PlatformConfig draft =
                new PlatformConfig(
                        0,
                        Arrays.asList((PlatformConfig.Provider) null),
                        List.of(),
                        "",
                        new PlatformConfig.Asr(false, "", ""),
                        new PlatformConfig.Knowledge(false, "", ""));

        assertThatThrownBy(() -> fixture.service.draft(draft))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("INVALID_PLATFORM_CONFIG");
    }

    @Test
    void unpublishedConfiguration_doesNotImportEnvironmentEndpointsOrKeys() {
        fixture.environment.getLlm().setUrl("https://legacy.invalid/chat");
        fixture.environment.getLlm().setApiKey("legacy-secret");
        fixture.environment.getLlm().setModel("organization/model-v1");
        PlatformConfig draft = fixture.service.get();

        assertThat(draft.providers()).isEmpty();
        assertThat(draft.models()).isEmpty();
        assertThat(draft.defaultModelId()).isEmpty();
        assertThatThrownBy(() -> fixture.service.snapshot().llm("organization/model-v1"))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("MODEL_UNAVAILABLE");
    }

    @Test
    void deserialize_writeOnlyKey_isAcceptedWhileReadOnlyFlagIsIgnored() throws Exception {
        String body =
                "{\"id\":\"primary\",\"name\":\"test\",\"kind\":\"llm\",\"url\":\"https://provider.invalid\",\"enabled\":true,\"hasApiKey\":true,\"apiKey\":\"fixture-secret\"}";

        PlatformConfig.Provider provider =
                fixture.json.readValue(body, PlatformConfig.Provider.class);

        assertThat(provider.apiKey()).isEqualTo("fixture-secret");
        assertThat(provider.hasApiKey()).isFalse();
        assertThat(fixture.json.writeValueAsString(provider))
                .doesNotContain("fixture-secret", "\"apiKey\"");
    }
    @Test
    void publish_webSearch_encryptsKeyAndPreservesOmittedLegacyField() throws Exception {
        var saved = fixture.service.publish(1, searchConfig(0, "search-secret", "https://api.tavily.com/search", new PlatformConfig.WebSearch(true, "tavily", 3, "basic", 1500)));
        assertThat(fixture.row.get().payload()).contains("v1:").doesNotContain("search-secret");
        assertThat(fixture.json.writeValueAsString(saved)).doesNotContain("search-secret", "apiKey", "encryptedKey");
        var request = fixture.json.readValue("{\"version\":1,\"providers\":[{\"id\":\"tavily\",\"name\":\"Search\",\"kind\":\"web-search\",\"url\":\"https://api.tavily.com/search\",\"enabled\":true}],\"models\":[],\"defaultModelId\":\"\",\"asr\":{\"enabled\":false,\"providerId\":\"\",\"model\":\"\"},\"knowledge\":{\"enabled\":false,\"providerId\":\"\",\"agentId\":\"\"}}", com.interview.copilot.request.platform.PlatformConfigRequest.class);
        new AdminPlatformConfigServiceImpl(fixture.service).publish(1, request);
        var runtime = fixture.service.snapshot().webSearch();
        assertThat(runtime.apiKey()).isEqualTo("search-secret");
        assertThat(runtime.topK()).isEqualTo(3);
        assertThat(runtime.searchDepth()).isEqualTo("basic");
        assertThat(runtime.timeoutMs()).isEqualTo(1500);
        assertThat(fixture.service.snapshot().availableModels()).isEmpty();
    }

    @Test
    void snapshot_legacyStoredConfig_defaultsSearchToDisabled() throws Exception {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "fixture-secret"));
        var row = fixture.row.get();
        var legacy = (com.fasterxml.jackson.databind.node.ObjectNode) fixture.json.readTree(row.payload());
        legacy.remove("webSearch");
        fixture.row.set(new com.interview.copilot.entity.platform.PlatformConfigRow(row.version(), row.published(), fixture.json.writeValueAsString(legacy)));
        assertThat(fixture.service.get().webSearch()).isEqualTo(PlatformConfig.WebSearch.disabled());
        assertThat(fixture.service.snapshot().webSearch().enabled()).isFalse();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"http://api.tavily.com/search", "https://api.tavily.com", "https://api.tavily.com/search?key=x", "https://key@api.tavily.com/search", "https://api.tavily.com/search#x"})
    void draft_searchEndpointIncorrect_rejectsExplicitly(String url) {
        assertThatThrownBy(() -> fixture.service.draft(searchConfig(0, "fixture", url, PlatformConfig.WebSearch.disabled())))
                .isInstanceOf(ApiException.class);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"0,advanced,8000", "21,advanced,8000", "5,invalid,8000", "5,advanced,999", "5,advanced,30001"})
    void draft_searchParametersOutOfBounds_rejects(int topK, String depth, int timeout) {
        assertThatThrownBy(() -> fixture.service.draft(searchConfig(0, "fixture", "https://api.tavily.com/search", new PlatformConfig.WebSearch(true, "tavily", topK, depth, timeout))))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void publish_searchConfigurationChanges_newRequestsGetNewSnapshotAndOldSnapshotIsImmutable() {
        fixture.service.publish(1, searchConfig(0, "fixture", "http://localhost:1234/search", new PlatformConfig.WebSearch(true, "tavily", 1, "basic", 1000)));
        var previous = fixture.service.snapshot().webSearch();
        fixture.service.publish(1, searchConfig(1, null, "http://localhost:1234/search", new PlatformConfig.WebSearch(false, "tavily", 20, "advanced", 30000)));
        assertThat(previous.enabled()).isTrue();
        assertThat(previous.topK()).isEqualTo(1);
        assertThat(fixture.service.snapshot().webSearch().enabled()).isFalse();
        assertThat(fixture.service.snapshot().webSearch().topK()).isEqualTo(20);
    }

    @Test
    void publish_oldNestedSearchRequest_preservesPreviouslySavedSummaryMode() throws Exception {
        fixture.service.publish(1, searchConfig(0, "search-key", "https://api.tavily.com/search",
                new PlatformConfig.WebSearch(true, "tavily", 5, "advanced", 8000, "basic")));
        var saved = fixture.service.get();
        var legacy = (com.fasterxml.jackson.databind.node.ObjectNode) fixture.json.valueToTree(saved);
        ((com.fasterxml.jackson.databind.node.ObjectNode) legacy.path("webSearch")).remove("includeAnswer");
        var request = fixture.json.treeToValue(legacy, com.interview.copilot.request.platform.PlatformConfigRequest.class);
        new AdminPlatformConfigServiceImpl(fixture.service).publish(1, request);
        assertThat(fixture.service.get().webSearch().includeAnswer()).isEqualTo("basic");
        assertThat(fixture.service.snapshot().webSearch().includeAnswer()).isEqualTo("basic");
        assertThat(fixture.row.get().payload()).doesNotContain("search-key");
        assertThat(fixture.service.snapshot().webSearch().apiKey()).isEqualTo("search-key");
    }

    @Test
    void snapshot_oldStoredNestedSearch_defaultsModeToNone() throws Exception {
        fixture.service.publish(1, searchConfig(0, "fixture", "https://api.tavily.com/search",
                new PlatformConfig.WebSearch(true, "tavily", 5, "advanced", 8000, "advanced")));
        var row = fixture.row.get();
        var legacy = (com.fasterxml.jackson.databind.node.ObjectNode) fixture.json.readTree(row.payload());
        ((com.fasterxml.jackson.databind.node.ObjectNode) legacy.path("webSearch")).remove("includeAnswer");
        fixture.row.set(new com.interview.copilot.entity.platform.PlatformConfigRow(row.version(), row.published(), fixture.json.writeValueAsString(legacy)));
        assertThat(fixture.service.get().webSearch().includeAnswer()).isEqualTo("none");
        assertThat(fixture.service.snapshot().webSearch().includeAnswer()).isEqualTo("none");
    }

    @Test
    void draft_invalidSummaryMode_rejectsWithoutPublishing() {
        assertThatThrownBy(() -> fixture.service.draft(searchConfig(0, "fixture", "https://api.tavily.com/search",
                new PlatformConfig.WebSearch(true, "tavily", 5, "advanced", 8000, "invalid"))))
                .isInstanceOf(ApiException.class);
        assertThat(fixture.row.get().published()).isFalse();
    }

    private PlatformConfig searchConfig(long version, String key, String url, PlatformConfig.WebSearch search) {
        var base = PlatformConfigFixture.empty(version);
        return new PlatformConfig(version, List.of(new PlatformConfig.Provider("tavily", "Search", "web-search", url, true, false, key)), List.of(), "", base.asr(), base.knowledge(), base.embedding(), search);
    }

}
