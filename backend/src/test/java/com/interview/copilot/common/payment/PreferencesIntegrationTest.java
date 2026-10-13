package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.node.ObjectNode;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.Map;
import java.util.UUID;

class PreferencesIntegrationTest extends PaymentHttpFixture {
    @org.junit.jupiter.api.BeforeEach
    void advancedPreferences() {
        jdbc.update(
                "UPDATE app_users SET advanced_settings_enabled=TRUE WHERE display_name='alice'");
    }

    @Test
    void save_versionsAndRetries_preserveIsolationAndRejectConflicts() {
        var defaults = call(HttpMethod.GET, "/user-preferences", aliceToken, null).getBody();
        ObjectNode preferences = defaults.path("preferences").deepCopy();
        preferences.put("answerStyle", "detailed");
        var body =
                Map.of(
                        "version",
                        0,
                        "mutationId",
                        UUID.randomUUID().toString(),
                        "preferences",
                        preferences);
        var saved = call(HttpMethod.POST, "/user-preferences", aliceToken, body);
        assertThat(saved.getStatusCode().value()).isEqualTo(200);
        assertThat(saved.getBody().path("version").asLong()).isEqualTo(1);
        assertThat(call(HttpMethod.POST, "/user-preferences", aliceToken, body).getBody())
                .isEqualTo(saved.getBody());
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/user-preferences",
                                        aliceToken,
                                        Map.of(
                                                "version",
                                                0,
                                                "mutationId",
                                                UUID.randomUUID().toString(),
                                                "preferences",
                                                preferences))
                                .getStatusCode()
                                .value())
                .isEqualTo(409);
        assertThat(
                        call(HttpMethod.GET, "/user-preferences", bobToken, null)
                                .getBody()
                                .path("preferences")
                                .path("answerStyle")
                                .asText())
                .isEqualTo("concise");
    }

    @Test
    void save_rejectsCustomSecretsInvalidRangesAndUnavailableServices() {
        ObjectNode preferences =
                call(HttpMethod.GET, "/user-preferences", aliceToken, null)
                        .getBody()
                        .path("preferences")
                        .deepCopy();
        preferences.put("apiKey", "must-not-upload");
        assertThat(save(preferences)).isEqualTo(400);
        preferences.remove("apiKey");
        preferences.put("silenceMs", -1);
        assertThat(save(preferences)).isEqualTo(400);
        preferences.put("silenceMs", 800);
        ((ObjectNode) preferences.path("platformSelections")).put("llm", "missing-model");
        assertThat(save(preferences)).isEqualTo(400);
        assertThat(
                        call(HttpMethod.GET, "/user-preferences", aliceToken, null)
                                .getBody()
                                .path("version")
                                .asLong())
                .isZero();
    }

    @Test
    void read_unavailableSelection_keepsIdentityAndMarksItWithoutFallback() {
        call(HttpMethod.GET, "/user-preferences", aliceToken, null);
        jdbc.update(
                "UPDATE user_preferences SET"
                    + " payload=jsonb_set(payload,'{platformSelections,llm}','\"removed-model\"'::jsonb)"
                    + " WHERE app_users_id=(SELECT id FROM app_users WHERE display_name='alice')");
        var result = call(HttpMethod.GET, "/user-preferences", aliceToken, null).getBody();
        assertThat(result.path("preferences").path("platformSelections").path("llm").asText())
                .isEqualTo("removed-model");
        assertThat(result.path("unavailableSelections").toString()).isEqualTo("[\"llm\"]");
        ObjectNode preferences = result.path("preferences").deepCopy();
        preferences.put("answerStyle", "detailed");
        assertThat(save(preferences)).isEqualTo(200);
    }

    @Test
    void webSearch_oldClientPreservesSwitchAndRevocationClearsIt() {
        var initial = call(HttpMethod.GET, "/user-preferences", aliceToken, null).getBody();
        assertThat(initial.path("preferences").path("webSearchEnabled").asBoolean()).isFalse();
        ObjectNode value = initial.path("preferences").deepCopy();
        value.put("webSearchEnabled", true);
        assertThat(save(value)).isEqualTo(200);
        var saved = call(HttpMethod.GET, "/user-preferences", aliceToken, null).getBody();
        ObjectNode legacy = saved.path("preferences").deepCopy();
        legacy.remove("webSearchEnabled");
        legacy.put("answerStyle", "detailed");
        var oldClient = call(HttpMethod.POST, "/user-preferences", aliceToken,
                Map.of("version", saved.path("version").asLong(), "mutationId", UUID.randomUUID().toString(), "preferences", legacy));
        assertThat(oldClient.getBody().path("preferences").path("webSearchEnabled").asBoolean()).isTrue();
        long user = jdbc.queryForObject("SELECT id FROM app_users WHERE display_name='alice'", Long.class);
        assertThat(call(HttpMethod.PUT, "/admin/desktop-settings/users/" + user, adminToken,
                Map.of("enabled", false)).getStatusCode().value()).isEqualTo(204);
        var revoked = call(HttpMethod.GET, "/user-preferences", aliceToken, null).getBody();
        assertThat(revoked.path("preferences").path("webSearchEnabled").asBoolean()).isFalse();
        assertThat(revoked.path("version").asLong()).isEqualTo(3);
        call(HttpMethod.PUT, "/admin/desktop-settings/users/" + user, adminToken, Map.of("enabled", true));
        assertThat(call(HttpMethod.GET, "/user-preferences", aliceToken, null).getBody()
                .path("preferences").path("webSearchEnabled").asBoolean()).isFalse();
    }

    @Test
    void webSearch_ordinaryAccountCannotEnableAndEndpointRejects() {
        ObjectNode value = call(HttpMethod.GET, "/user-preferences", bobToken, null).getBody().path("preferences").deepCopy();
        value.put("webSearchEnabled", true);
        var saved = call(HttpMethod.POST, "/user-preferences", bobToken,
                Map.of("version", 0, "mutationId", UUID.randomUUID().toString(), "preferences", value));
        assertThat(saved.getBody().path("preferences").path("webSearchEnabled").asBoolean()).isFalse();
        assertThat(call(HttpMethod.POST, "/web-search", bobToken,
                Map.of("query", "question", "requestId", UUID.randomUUID().toString())).getStatusCode().value()).isEqualTo(403);
    }

    private int save(ObjectNode preferences) {
        return call(
                        HttpMethod.POST,
                        "/user-preferences",
                        aliceToken,
                        Map.of(
                                "version",
                                0,
                                "mutationId",
                                UUID.randomUUID().toString(),
                                "preferences",
                                preferences))
                .getStatusCode()
                .value();
    }
}
