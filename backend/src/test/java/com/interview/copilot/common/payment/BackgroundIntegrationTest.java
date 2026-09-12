package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class BackgroundIntegrationTest extends PaymentHttpFixture {
    private String uuid() {
        return UUID.randomUUID().toString();
    }

    private Map<String, Object> saveBody(long version, Object content) {
        return Map.of("version", version, "mutationId", uuid(), "content", content);
    }

    private JsonNode library(String token) {
        var response = call(HttpMethod.GET, "/background", token, null);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    private JsonNode save(String kind, String id, Object body) {
        var response = call(HttpMethod.POST, "/background/" + kind + "/" + id, aliceToken, body);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    private Map<String, Object> environment(String resume) {
        var content = new HashMap<String, Object>();
        content.put("name", "后端面试");
        content.put("resumeId", resume);
        content.put("targetId", null);
        content.put("referenceIds", List.of());
        return content;
    }

    @Test
    void profiles_areIsolatedAndVersioned_andListsOmitUnselectedBody() {
        String id = uuid();
        var body = saveBody(0, Map.of("name", "Java简历", "text", "项目经历"));
        var first = save("resumes", id, body);
        assertThat(save("resumes", id, body)).isEqualTo(first);
        assertThat(library(aliceToken).path("resumes").get(0).path("text").asText()).isEmpty();
        assertThat(library(aliceToken).path("resumes").get(0).path("hasContent").asBoolean())
                .isTrue();
        assertThat(library(bobToken).path("resumes").size()).isZero();
        assertThat(
                        call(HttpMethod.GET, "/background/resumes/" + id, bobToken, null)
                                .getStatusCode()
                                .value())
                .isEqualTo(404);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/background/resumes/" + id,
                                        aliceToken,
                                        saveBody(0, Map.of("name", "旧版本", "text", "旧正文")))
                                .getStatusCode()
                                .value())
                .isEqualTo(409);
        assertThat(
                        call(HttpMethod.GET, "/background/resumes/" + id, aliceToken, null)
                                .getBody()
                                .path("text")
                                .asText())
                .isEqualTo("项目经历");
    }

    @Test
    void associations_requireOwnership_andPreventDeletingUsedResumesOrDefault() {
        String id = uuid();
        save("resumes", id, saveBody(0, Map.of("name", "简历", "text", "经历")));
        String env = library(aliceToken).path("activeEnvironmentId").asText();
        save("environments", env, saveBody(1, environment(id)));
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/background/resumes/" + id + "/delete",
                                        aliceToken,
                                        Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(409);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/background/environments/" + env + "/delete",
                                        aliceToken,
                                        Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(409);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/background/environments/" + uuid(),
                                        bobToken,
                                        saveBody(0, environment(id)))
                                .getStatusCode()
                                .value())
                .isEqualTo(404);
        var content = environment(id);
        content.put("referenceIds", List.of(uuid()));
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/background/environments/" + env,
                                        aliceToken,
                                        saveBody(2, content))
                                .getStatusCode()
                                .value())
                .isEqualTo(400);
    }

    @Test
    void start_requiresResumeBeforeTiming_andFreezesExactBackgroundForRetries() {
        long user =
                jdbc.queryForObject(
                        "SELECT id FROM app_users WHERE display_name='alice'", Long.class);
        jdbc.update(
                "INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(?,3600)", user);
        String env = library(aliceToken).path("activeEnvironmentId").asText();
        String request = uuid();
        var start = Map.of("requestId", request, "environmentId", env);
        assertThat(
                        call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start)
                                .getStatusCode()
                                .value())
                .isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM interview_sessions", Long.class))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT available_seconds FROM time_wallets WHERE app_users_id=?",
                                Long.class,
                                user))
                .isEqualTo(3600);
        String resume = uuid();
        save("resumes", resume, saveBody(0, Map.of("name", "简历", "text", "原始经历")));
        save("environments", env, saveBody(1, environment(resume)));
        var first = call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start);
        assertThat(first.getStatusCode().value()).isEqualTo(200);
        assertThat(first.getBody().path("background").path("context").path("text").asText())
                .isEqualTo("原始经历");
        save("resumes", resume, saveBody(1, Map.of("name", "新简历", "text", "已修改经历")));
        var retry = call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start);
        assertThat(retry.getBody().path("background"))
                .isEqualTo(first.getBody().path("background"));
        assertThat(retry.getBody().path("session").path("id"))
                .isEqualTo(first.getBody().path("session").path("id"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM interview_sessions", Long.class))
                .isEqualTo(1);
    }

    @Test
    void deletion_tombstoneRejectsLateCreate_andUnreadyReferencesNeverStartBilling() {
        String resume = uuid();
        var body = saveBody(0, Map.of("name", "临时简历", "text", "经历"));
        save("resumes", resume, body);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/background/resumes/" + resume + "/delete",
                                        aliceToken,
                                        Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(200);
        assertThat(
                        call(HttpMethod.POST, "/background/resumes/" + resume, aliceToken, body)
                                .getStatusCode()
                                .value())
                .isEqualTo(410);
        assertThat(library(aliceToken).path("resumes").size()).isZero();
        long user =
                jdbc.queryForObject(
                        "SELECT id FROM app_users WHERE display_name='alice'", Long.class);
        jdbc.update(
                "INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(?,3600)", user);
        String document = uuid();
        jdbc.update(
                "INSERT INTO"
                        + " reference_documents(id,app_users_id,name,content_hash,file_size,status)"
                        + " VALUES(CAST(? AS uuid),?,'资料',?,1,'indexing')",
                document,
                user,
                "a".repeat(64));
        String validResume = uuid();
        save("resumes", validResume, saveBody(0, Map.of("name", "简历", "text", "开发经历")));
        String env = library(aliceToken).path("activeEnvironmentId").asText();
        var content = environment(validResume);
        content.put("referenceIds", List.of(document));
        save("environments", env, saveBody(1, content));
        var start = Map.of("requestId", uuid(), "environmentId", env);
        assertThat(
                        call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start)
                                .getStatusCode()
                                .value())
                .isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM interview_sessions", Long.class))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT available_seconds FROM time_wallets WHERE app_users_id=?",
                                Long.class,
                                user))
                .isEqualTo(3600);
    }
}
