package com.interview.copilot.common.payment;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class EnvironmentStampIntegrationTest extends PaymentHttpFixture {
    private String uuid() {
        return UUID.randomUUID().toString();
    }

    private JsonNode library(String token) {
        var result = call(HttpMethod.GET, "/background", token, null);
        assertThat(result.getStatusCode().value()).isEqualTo(200);
        return result.getBody();
    }

    private Map<String, Object> stampBody(long version, String mutation, Object stamp) {
        var result = new HashMap<String, Object>();
        result.put("version", version);
        result.put("mutationId", mutation);
        result.put("stamp", stamp);
        return result;
    }

    private JsonNode stamp(String id, Object body) {
        var result = call(HttpMethod.POST, "/background/environments/" + id + "/stamp", aliceToken, body);
        assertThat(result.getStatusCode().value()).isEqualTo(200);
        return result.getBody();
    }

    private Map<String, Object> environment(String resume) {
        var result = new HashMap<String, Object>();
        result.put("name", "面试");
        result.put("interviewType", "technical");
        result.put("resumeId", resume);
        result.put("targetId", null);
        result.put("referenceIds", List.of());
        return result;
    }

    @Test
    void stamp_saveReloadRetryAndClear_persistExactlyOnceAndPreserveOrdinaryEdits() {
        var initial = library(aliceToken);
        String id = initial.path("activeEnvironmentId").asText();
        assertThat(initial.path("environments").get(0).has("stamp")).isFalse();
        String mutation = uuid();
        var body = stampBody(1, mutation, Map.of("text", "  待跟进  ", "color", "amber"));
        var saved = stamp(id, body);
        assertThat(saved.path("version").asLong()).isEqualTo(2);
        assertThat(saved.path("stamp").path("text").asText()).isEqualTo("待跟进");
        assertThat(stamp(id, stampBody(1, mutation, Map.of("text", "待跟进", "color", "amber")))).isEqualTo(saved);
        assertThat(library(aliceToken).path("environments").get(0).path("stamp")).isEqualTo(saved.path("stamp"));
        assertThat(call(HttpMethod.POST, "/background/environments/" + id + "/stamp", aliceToken,
                stampBody(2, mutation, Map.of("text", "已通过", "color", "green"))).getStatusCode().value()).isEqualTo(409);
        assertThat(call(HttpMethod.POST, "/background/environments/" + id + "/stamp", aliceToken,
                stampBody(1, uuid(), Map.of("text", "已通过", "color", "green"))).getStatusCode().value()).isEqualTo(409);
        var edit = call(HttpMethod.POST, "/background/environments/" + id, aliceToken,
                Map.of("version", 2, "mutationId", uuid(), "content", environment(null)));
        assertThat(edit.getStatusCode().value()).isEqualTo(200);
        assertThat(edit.getBody().path("stamp")).isEqualTo(saved.path("stamp"));
        var clearBody = stampBody(3, uuid(), null);
        var cleared = stamp(id, clearBody);
        assertThat(cleared.path("version").asLong()).isEqualTo(4);
        assertThat(cleared.path("stamp").isNull()).isTrue();
        assertThat(stamp(id, clearBody)).isEqualTo(cleared);
        assertThat(call(HttpMethod.GET, "/background/environments/" + id, aliceToken, null)
                .getBody().path("stamp").isNull()).isTrue();
    }

    @Test
    void stamp_foreignOrDeletedEnvironment_rejectsAndNeverRecreates() {
        String id = uuid();
        library(aliceToken);
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken,
                Map.of("version", 0, "mutationId", uuid(), "content", environment(null)))
                .getStatusCode().value()).isEqualTo(200);
        var body = stampBody(1, uuid(), Map.of("text", "已准备", "color", "blue"));
        assertThat(call(HttpMethod.POST, "/background/environments/" + id + "/stamp", bobToken, body)
                .getStatusCode().value()).isEqualTo(404);
        assertThat(library(bobToken).path("environments").get(0).has("stamp")).isFalse();
        assertThat(call(HttpMethod.POST, "/background/environments/" + id + "/delete", aliceToken, Map.of())
                .getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.POST, "/background/environments/" + id + "/stamp", aliceToken, body)
                .getStatusCode().value()).isEqualTo(410);
        assertThat(library(aliceToken).path("environments").size()).isEqualTo(1);
    }

    @Test
    void stamp_invalidRequest_rejectsUnknownMissingAndFractionalFieldsWithoutWriting() {
        String id = library(aliceToken).path("activeEnvironmentId").asText();
        String path = "/background/environments/" + id + "/stamp";
        assertThat(call(HttpMethod.POST, path, aliceToken, Map.of("version", 1, "mutationId", uuid()))
                .getStatusCode().value()).isEqualTo(400);
        assertThat(call(HttpMethod.POST, path, aliceToken,
                stampBody(1, uuid(), Map.of("text", "已准备", "color", "blue", "style", "red")))
                .getStatusCode().value()).isEqualTo(400);
        var fractional = stampBody(1, uuid(), Map.of("text", "已准备", "color", "blue"));
        fractional.put("version", 0.5);
        assertThat(call(HttpMethod.POST, path, aliceToken, fractional).getStatusCode().value()).isEqualTo(400);
        var content = environment(null);
        content.put("stamp", Map.of("text", "已准备", "color", "blue"));
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken,
                Map.of("version", 1, "mutationId", uuid(), "content", content)).getStatusCode().value()).isEqualTo(400);
        assertThat(call(HttpMethod.GET, "/background/environments/" + id, aliceToken, null)
                .getBody().path("version").asLong()).isEqualTo(1);
    }

    @Test
    void stamp_activeInterview_doesNotAlterSnapshotSessionOrWallet() {
        long user = jdbc.queryForObject("SELECT id FROM app_users WHERE display_name='alice'", Long.class);
        jdbc.update("INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(?,3600)", user);
        String id = library(aliceToken).path("activeEnvironmentId").asText();
        String resume = uuid();
        assertThat(call(HttpMethod.POST, "/background/resumes/" + resume, aliceToken,
                Map.of("version", 0, "mutationId", uuid(), "content", Map.of("name", "简历", "text", "真实经历")))
                .getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.POST, "/background/environments/" + id, aliceToken,
                Map.of("version", 1, "mutationId", uuid(), "content", environment(resume)))
                .getStatusCode().value()).isEqualTo(200);
        stamp(id, stampBody(2, uuid(), Map.of("text", "已准备", "color", "blue")));
        var start = Map.of("requestId", uuid(), "environmentId", id);
        var first = call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start).getBody();
        assertThat(first.path("background").path("interviewEnvironment").has("stamp")).isFalse();
        String frozen = jdbc.queryForObject("SELECT background_snapshot::text FROM interview_sessions WHERE app_users_id=?", String.class, user);
        long walletVersion = jdbc.queryForObject("SELECT version FROM time_wallets WHERE app_users_id=?", Long.class, user);
        stamp(id, stampBody(3, uuid(), Map.of("text", "待跟进", "color", "amber")));
        assertThat(jdbc.queryForObject("SELECT background_snapshot::text FROM interview_sessions WHERE app_users_id=?", String.class, user)).isEqualTo(frozen);
        assertThat(jdbc.queryForObject("SELECT status FROM interview_sessions WHERE app_users_id=?", String.class, user)).isEqualTo("active");
        assertThat(jdbc.queryForObject("SELECT version FROM time_wallets WHERE app_users_id=?", Long.class, user)).isEqualTo(walletVersion);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM time_wallet_transactions WHERE operation='consume'", Long.class)).isZero();
        assertThat(call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start).getBody().path("background"))
                .isEqualTo(first.path("background"));
    }
}
