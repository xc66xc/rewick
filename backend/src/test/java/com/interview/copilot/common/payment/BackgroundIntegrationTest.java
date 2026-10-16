package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 验证面试准备持久化、隔离及类型冻结
 */
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
        content.put("interviewType", "technical");
        content.put("resumeId", resume);
        content.put("targetId", null);
        content.put("referenceIds", List.of());
        return content;
    }

    @Test
    void hotwords_saveReloadLegacyEditAndClear_preserveIsolation() {
        String env = library(aliceToken).path("activeEnvironmentId").asText();
        var content = environment(null);
        content.put("hotwords", List.of(" Agent ", "Agent", "虚拟量测"));
        var saved = save("environments", env, saveBody(1, content));
        assertThat(saved.path("hotwords").toString()).isEqualTo("[\"Agent\",\"虚拟量测\"]");
        assertThat(library(aliceToken).path("environments").get(0).path("hotwords")).isEqualTo(saved.path("hotwords"));
        content.remove("hotwords");
        saved = save("environments", env, saveBody(saved.path("version").asLong(), content));
        assertThat(saved.path("hotwords").size()).isEqualTo(2);
        content.put("hotwords", List.of());
        saved = save("environments", env, saveBody(saved.path("version").asLong(), content));
        assertThat(saved.path("hotwords").isEmpty()).isTrue();
        assertThat(library(bobToken).path("environments").get(0).path("hotwords").isMissingNode()).isTrue();
    }

    @Test
    void hrMigration_preservesExistingContentAndRejectsUnknownDatabaseValues() throws Exception {
        String env = library(aliceToken).path("activeEnvironmentId").asText();
        var content = environment(null);
        content.put("interviewType", "general");
        save("environments", env, saveBody(1, content));
        String before = jdbc.queryForObject(
                "SELECT content::text FROM interview_environments WHERE id=CAST(? AS uuid)", String.class, env);
        jdbc.execute(java.nio.file.Files.readString(java.nio.file.Path.of("sql/26_hr_interview_type.sql")));
        assertThat(jdbc.queryForObject(
                "SELECT content::text FROM interview_environments WHERE id=CAST(? AS uuid)", String.class, env))
                .isEqualTo(before);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update(
                "UPDATE interview_environments SET content=jsonb_set(content,'{interviewType}','\"invalid\"'::jsonb) WHERE id=CAST(? AS uuid)", env))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void interviewType_requiresKnownValue_andSurvivesLibraryReload() {
        var initial = library(aliceToken);
        assertThat(initial.path("environments").get(0).path("interviewType").asText())
                .isEqualTo("technical");
        String env = initial.path("activeEnvironmentId").asText();
        var content = environment(null);
        for (String invalid : List.of("", "HR", "TECHNICAL")) {
            content.put("interviewType", invalid);
            assertThat(call(HttpMethod.POST, "/background/environments/" + env, aliceToken,
                    saveBody(1, content)).getStatusCode().value()).isEqualTo(400);
        }
        content.remove("interviewType");
        assertThat(call(HttpMethod.POST, "/background/environments/" + env, aliceToken,
                saveBody(1, content)).getStatusCode().value()).isEqualTo(400);
        content.put("interviewType", "general");
        save("environments", env, saveBody(1, content));
        assertThat(library(aliceToken).path("environments").get(0).path("interviewType").asText())
                .isEqualTo("general");
        assertThat(library(bobToken).path("environments").get(0).path("interviewType").asText())
                .isEqualTo("technical");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"general", "hr"})
    void interviewType_isFrozenDuringSession_andHistorySurvivesLaterEdits(String type) {
        long user = jdbc.queryForObject("SELECT id FROM app_users WHERE display_name='alice'", Long.class);
        jdbc.update("INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(?,3600)", user);
        String env = library(aliceToken).path("activeEnvironmentId").asText();
        String resume = uuid();
        save("resumes", resume, saveBody(0, Map.of("name", "简历", "text", "真实经历")));
        var content = environment(resume);
        content.put("interviewType", type);
        save("environments", env, saveBody(1, content));
        var start = Map.of("requestId", uuid(), "environmentId", env);
        var first = call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start).getBody();
        var snapshot = first.path("background").path("interviewEnvironment");
        assertThat(snapshot.path("interviewType").asText()).isEqualTo(type);
        content.put("interviewType", "technical");
        assertThat(call(HttpMethod.POST, "/background/environments/" + env, aliceToken,
                saveBody(2, content)).getStatusCode().value()).isEqualTo(409);
        assertThat(call(HttpMethod.POST, "/interview-sessions/start", aliceToken, start)
                .getBody().path("background").path("interviewEnvironment")).isEqualTo(snapshot);
        var record = Map.of("id", "typed-session", "title", "综合面试", "createdAt", "2026-09-20T10:00:00+08:00",
                "segments", List.of(), "answers", List.of(), "interviewEnvironment", snapshot);
        assertThat(call(HttpMethod.POST, "/session-records/typed-session", aliceToken,
                Map.of("version", 0, "mutationId", uuid(), "record", record)).getStatusCode().value()).isEqualTo(200);
        String session = first.path("session").path("id").asText();
        assertThat(call(HttpMethod.POST, "/interview-sessions/" + session + "/end", aliceToken,
                Map.of()).getStatusCode().value()).isEqualTo(200);
        save("environments", env, saveBody(2, content));
        assertThat(call(HttpMethod.GET, "/session-records/typed-session", aliceToken, null)
                .getBody().path("record").path("interviewEnvironment").path("interviewType").asText()).isEqualTo(type);
        assertThat(library(aliceToken).path("environments").get(0).path("interviewType").asText()).isEqualTo("technical");
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
