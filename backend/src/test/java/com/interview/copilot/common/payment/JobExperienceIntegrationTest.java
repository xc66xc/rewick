package com.interview.copilot.common.payment;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

class JobExperienceIntegrationTest extends PaymentHttpFixture {
    private String uuid() { return UUID.randomUUID().toString(); }
    private String active() {
        return call(HttpMethod.GET, "/background", aliceToken, null).getBody().path("activeEnvironmentId").asText();
    }
    private Map<String, Object> environment(String resume) {
        var body = new HashMap<String, Object>();
        body.put("name", "经验要求测试"); body.put("interviewType", "technical");
        body.put("resumeId", resume); body.put("targetId", null); body.put("referenceIds", List.of());
        return body;
    }
    private Map<String, Object> body(long version, String mutation, Object content) {
        return Map.of("version", version, "mutationId", mutation, "content", content);
    }
    private JsonNode save(String id, long version, Map<String, Object> content) {
        var response = call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(version, uuid(), content));
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    @Test void save_fourLevelsLegacyOmissionAndExplicitClear_preservesMetadataAndIsolation() {
        String id = active();
        var content = environment(null);
        content.put("hotwords", List.of("Agent"));
        long version = 1;
        for (String level : List.of("no_experience", "one_to_three_years", "three_to_five_years", "five_plus_years")) {
            content.put("jobExperienceLevel", level);
            var saved = save(id, version++, content);
            assertThat(saved.path("jobExperienceLevel").asText()).isEqualTo(level);
        }
        var stamped = call(HttpMethod.POST, "/background/environments/" + id + "/stamp", aliceToken,
                Map.of("version", version, "mutationId", uuid(), "stamp", Map.of("text", "一面中", "color", "blue")));
        assertThat(stamped.getStatusCode().value()).isEqualTo(200);
        version++;
        content.remove("jobExperienceLevel"); content.remove("hotwords");
        var saved = save(id, version++, content);
        assertThat(saved.path("jobExperienceLevel").asText()).isEqualTo("five_plus_years");
        assertThat(saved.path("hotwords").get(0).asText()).isEqualTo("Agent");
        assertThat(saved.path("stamp").path("text").asText()).isEqualTo("一面中");
        assertThat(call(HttpMethod.GET, "/background/environments/" + id, bobToken, null).getStatusCode().value()).isEqualTo(404);
        content.put("jobExperienceLevel", null);
        assertThat(save(id, version, content).path("jobExperienceLevel").isNull()).isTrue();
    }

    @Test void save_normalizedLegacyRetry_conflictsForDifferentContentAndStaleVersion() {
        String id = active(); var content = environment(null); content.put("jobExperienceLevel", "three_to_five_years");
        String mutation = uuid();
        var first = call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(1, mutation, content));
        content.remove("jobExperienceLevel");
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(1, mutation, content)).getBody()).isEqualTo(first.getBody());
        content.put("jobExperienceLevel", null);
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(1, mutation, content)).getStatusCode().value()).isEqualTo(409);
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(1, uuid(), content)).getStatusCode().value()).isEqualTo(409);
    }

    @Test void save_unknownLevelAndDeletedEnvironment_rejects() {
        String id = uuid(); var content = environment(null); content.put("jobExperienceLevel", "senior");
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(0, uuid(), content)).getStatusCode().value()).isEqualTo(400);
        content.put("jobExperienceLevel", "one_to_three_years"); save(id, 0, content);
        call(HttpMethod.POST, "/background/environments/" + id + "/delete", aliceToken, Map.of());
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(1, uuid(), content)).getStatusCode().value()).isEqualTo(410);
    }

    @Test void start_freezesRequirementAndProtectsActiveOnly_preservesHistoryAfterLaterEdit() {
        long user = jdbc.queryForObject("SELECT id FROM app_users WHERE display_name='alice'", Long.class);
        jdbc.update("INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(?,3600)", user);
        String id = active(); String resume = uuid();
        call(HttpMethod.POST, "/background/resumes/" + resume, aliceToken, body(0, uuid(), Map.of("name", "简历", "text", "实际经历")));
        var content = environment(resume); content.put("jobExperienceLevel", "three_to_five_years"); save(id, 1, content);
        var request = Map.of("requestId", uuid(), "environmentId", id);
        var started = call(HttpMethod.POST, "/interview-sessions/start", aliceToken, request).getBody();
        var snapshot = started.path("background").path("interviewEnvironment");
        assertThat(snapshot.path("jobExperienceLevel").asText()).isEqualTo("three_to_five_years");
        content.put("jobExperienceLevel", "five_plus_years");
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(2, uuid(), content)).getStatusCode().value()).isEqualTo(409);
        save(uuid(), 0, content);
        assertThat(call(HttpMethod.POST, "/interview-sessions/start", aliceToken, request).getBody().path("background")).isEqualTo(started.path("background"));
        var record = Map.of("id", "experience", "title", "面试", "createdAt", "2026-10-13T10:00:00+08:00", "segments", List.of(), "answers", List.of(), "interviewEnvironment", snapshot);
        assertThat(call(HttpMethod.POST, "/session-records/experience", aliceToken, Map.of("version", 0, "mutationId", uuid(), "record", record)).getStatusCode().value()).isEqualTo(200);
        call(HttpMethod.POST, "/interview-sessions/" + started.path("session").path("id").asText() + "/end", aliceToken, Map.of());
        save(id, 2, content);
        assertThat(call(HttpMethod.GET, "/session-records/experience", aliceToken, null).getBody().path("record").path("interviewEnvironment").path("jobExperienceLevel").asText()).isEqualTo("three_to_five_years");
    }

    @Test void save_legacyActiveSnapshotMissingLevel_treatsMissingAsUnsetWithoutRewritingHistory() {
        long user = jdbc.queryForObject("SELECT id FROM app_users WHERE display_name='alice'", Long.class);
        jdbc.update("INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(?,3600)", user);
        String id = active(); String resume = uuid();
        call(HttpMethod.POST, "/background/resumes/" + resume, aliceToken, body(0, uuid(), Map.of("name", "简历", "text", "实际经历")));
        var content = environment(resume); save(id, 1, content);
        var request = Map.of("requestId", uuid(), "environmentId", id);
        var started = call(HttpMethod.POST, "/interview-sessions/start", aliceToken, request).getBody();
        String sessionId = started.path("session").path("id").asText();
        jdbc.update("UPDATE interview_sessions SET background_snapshot=background_snapshot #- '{interviewEnvironment,jobExperienceLevel}' WHERE session_id=?", sessionId);
        content.put("jobExperienceLevel", null);
        assertThat(save(id, 2, content).path("jobExperienceLevel").isNull()).isTrue();
        content.put("jobExperienceLevel", "no_experience");
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken, body(3, uuid(), content)).getStatusCode().value()).isEqualTo(409);
        assertThat(call(HttpMethod.POST, "/interview-sessions/start", aliceToken, request).getBody().path("background").path("interviewEnvironment").has("jobExperienceLevel")).isFalse();
    }
}
