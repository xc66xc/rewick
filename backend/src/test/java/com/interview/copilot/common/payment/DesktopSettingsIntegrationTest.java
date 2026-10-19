package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.platform.PlatformConfigService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

import java.util.Map;
import java.util.UUID;

class DesktopSettingsIntegrationTest extends PaymentHttpFixture {
    @Autowired PlatformConfigService platform;
    @Autowired DesktopSettingsService desktop;

    @BeforeEach
    void defaults() {
        jdbc.update(
                "UPDATE desktop_settings SET"
                    + " version=0,llm_model_id='',temperature=0.7,asr_service_id=''"
                    + " WHERE id=1");
        jdbc.update(
                "UPDATE platform_config SET version=0,is_published=FALSE,payload='{}'::jsonb WHERE"
                    + " id=1");
    }

    private long id(String name) {
        return jdbc.queryForObject(
                "SELECT id FROM app_users WHERE display_name=?", Long.class, name);
    }

    private Map<String, Object> policy(long version, String model) {
        return Map.of(
                "version",
                version,
                "llmModelId",
                model,
                "temperature",
                0.4,
                "asrServiceId",
                "");
    }

    private void grant(boolean enabled) {
        assertThat(
                        call(
                                        HttpMethod.PUT,
                                        "/admin/desktop-settings/users/" + id("alice"),
                                        adminToken,
                                        Map.of("enabled", enabled))
                                .getStatusCode()
                                .value())
                .isEqualTo(204);
    }

    @Test
    void permissions_defaultHiddenAndAdminGrantIsIsolatedAndRevocable() {
        assertThat(
                        call(HttpMethod.GET, "/platform", aliceToken, null)
                                .getBody()
                                .path("advancedSettingsEnabled")
                                .asBoolean())
                .isFalse();
        assertThat(
                        call(
                                        HttpMethod.PUT,
                                        "/admin/desktop-settings/users/" + id("alice"),
                                        aliceToken,
                                        Map.of("enabled", true))
                                .getStatusCode()
                                .value())
                .isEqualTo(403);
        jdbc.update(
                "INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at)"
                    + " VALUES(?,'email','alice@example.test',LOCALTIMESTAMP)",
                id("alice"));
        grant(true);
        assertThat(
                        call(HttpMethod.GET, "/platform", aliceToken, null)
                                .getBody()
                                .path("advancedSettingsEnabled")
                                .asBoolean())
                .isTrue();
        assertThat(
                        call(HttpMethod.GET, "/platform", bobToken, null)
                                .getBody()
                                .path("advancedSettingsEnabled")
                                .asBoolean())
                .isFalse();
        assertThat(
                        call(HttpMethod.GET, "/admin/desktop-settings/users", adminToken, null)
                                .getBody()
                                .get(0)
                                .path("email")
                                .asText())
                .isEqualTo("alice@example.test");
        grant(false);
        assertThat(
                        call(HttpMethod.GET, "/platform", aliceToken, null)
                                .getBody()
                                .path("advancedSettingsEnabled")
                                .asBoolean())
                .isFalse();
        assertThat(
                        call(HttpMethod.GET, "/admin/desktop-settings/users", adminToken, null)
                                .getBody()
                                .size())
                .isZero();
    }

    @Test
    void defaults_validateAvailabilityVersionAndPreventDisablingSelectedModel() {
        platform.publish(id("administrator"), PlatformConfigFixture.config(0, "fake-provider-key"));
        var saved = call(HttpMethod.PUT, "/admin/desktop-settings", adminToken, policy(0, "fast"));
        assertThat(saved.getStatusCode().value()).isEqualTo(200);
        assertThat(
                        call(HttpMethod.GET, "/platform", aliceToken, null)
                                .getBody()
                                .path("desktopDefaults")
                                .path("llmModelId")
                                .asText())
                .isEqualTo("fast");
        assertThat(
                        call(
                                        HttpMethod.PUT,
                                        "/admin/desktop-settings",
                                        adminToken,
                                        policy(0, "careful"))
                                .getStatusCode()
                                .value())
                .isEqualTo(409);
        assertThat(
                        call(
                                        HttpMethod.PUT,
                                        "/admin/desktop-settings",
                                        adminToken,
                                        policy(1, "missing"))
                                .getStatusCode()
                                .value())
                .isEqualTo(400);
        var previous = platform.get();
        var disabled =
                new PlatformConfig(
                        previous.version(),
                        previous.providers(),
                        previous.models().stream()
                                .map(
                                        m ->
                                                new PlatformConfig.Model(
                                                        m.id(),
                                                        m.name(),
                                                        m.providerId(),
                                                        m.model(),
                                                        !m.id().equals("fast"),
                                                        m.maxOutputTokens()))
                                .toList(),
                        "careful",
                        previous.asr(),
                        previous.embedding());
        assertThatThrownBy(() -> platform.publish(id("administrator"), disabled))
                .isInstanceOf(ApiException.class);
        assertThat(
                        call(
                                        HttpMethod.PUT,
                                        "/admin/desktop-settings",
                                        adminToken,
                                        policy(1, "careful"))
                                .getStatusCode()
                                .value())
                .isEqualTo(200);
        platform.publish(id("administrator"), disabled);
    }

    @Test
    void ordinaryRequest_cannotChooseOtherModelOrTemperature() {
        platform.publish(id("administrator"), PlatformConfigFixture.config(0, "fake-provider-key"));
        assertThat(
                        call(
                                        HttpMethod.PUT,
                                        "/admin/desktop-settings",
                                        adminToken,
                                        policy(0, "fast"))
                                .getStatusCode()
                                .value())
                .isEqualTo(200);
        for (var override :
                java.util.List.of(
                        Map.of("model", "careful"), Map.of("model", "fast", "temperature", 1.2))) {
            assertThat(
                            call(HttpMethod.POST, "/llm/chat/completions", aliceToken, override)
                                    .getStatusCode()
                                    .value())
                    .isEqualTo(403);
        }
        grant(true);
        assertThat(desktop.asr(id("alice"), "custom-choice")).isEqualTo("custom-choice");
        grant(false);
        assertThatThrownBy(() -> desktop.asr(id("alice"), "custom-choice"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void ordinaryStyleSave_preservesHiddenPreferencesForReauthorization() {
        platform.publish(id("administrator"), PlatformConfigFixture.config(0, "fake-provider-key"));
        grant(true);
        var initial = call(HttpMethod.GET, "/user-preferences", aliceToken, null).getBody();
        ObjectNode preferences = initial.path("preferences").deepCopy();
        preferences.put("temperature", 1.1);
        ((ObjectNode) preferences.path("platformSelections")).put("llm", "careful");
        var saved =
                call(
                        HttpMethod.POST,
                        "/user-preferences",
                        aliceToken,
                        Map.of(
                                "version",
                                0,
                                "mutationId",
                                UUID.randomUUID(),
                                "preferences",
                                preferences));
        assertThat(saved.getStatusCode().value()).isEqualTo(200);
        grant(false);
        preferences.put("answerStyle", "detailed");
        preferences.put("temperature", 0.4);
        ((ObjectNode) preferences.path("platformSelections")).put("llm", "fast");
        var result =
                call(
                        HttpMethod.POST,
                        "/user-preferences",
                        aliceToken,
                        Map.of(
                                "version",
                                saved.getBody().path("version").asLong(),
                                "mutationId",
                                UUID.randomUUID(),
                                "preferences",
                                preferences));
        assertThat(result.getStatusCode().value()).isEqualTo(200);
        assertThat(result.getBody().path("preferences").path("answerStyle").asText())
                .isEqualTo("detailed");
        assertThat(result.getBody().path("preferences").path("temperature").asDouble())
                .isEqualTo(1.1);
        assertThat(
                        result.getBody()
                                .path("preferences")
                                .path("platformSelections")
                                .path("llm")
                                .asText())
                .isEqualTo("careful");
        grant(true);
        assertThat(
                        call(HttpMethod.GET, "/user-preferences", aliceToken, null)
                                .getBody()
                                .path("preferences"))
                .isEqualTo(result.getBody().path("preferences"));
    }
}
