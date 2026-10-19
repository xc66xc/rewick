package com.interview.copilot.model.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/** Validates the irreversible cleanup against isolated PostgreSQL, never an application database. */
@Tag("integration")
@Testcontainers
class RemoteKnowledgeRemovalIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>(
            DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                    .asCompatibleSubstituteFor("postgres"))
                    .withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql")),"/tmp/sql");
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void migrate_existingRemoteConfiguration_preservesAnswersOtherProvidersAndBilling() throws Exception {
        try (var connection = connect(); var sql = connection.createStatement()) {
            initializeBusiness();
            sql.execute(Files.readString(Path.of("src/test/resources/remove-remote-knowledge-fixture.sql")));
            var originalInput = node(sql,"SELECT content::text FROM session_records WHERE record_id='preserved-record'")
                    .path("answers").get(0).path("modelInput").deepCopy();
            sql.execute(Files.readString(Path.of("sql/29_remove_remote_knowledge.sql")));

            var config = node(sql, "SELECT payload::text FROM platform_config");
            assertThat(config.has("knowledge")).isFalse();
            assertThat(config.path("providers").size()).isEqualTo(2);
            assertThat(config.path("providers").get(0).path("encryptedKey").asText()).isEqualTo("encrypted-llm");
            assertThat(config.path("providers").get(1).path("encryptedKey").asText()).isEqualTo("encrypted-web");
            assertThat(config.path("embedding").path("dimensions").asInt()).isEqualTo(1024);
            assertThat(config.path("webSearch").path("enabled").asBoolean()).isTrue();
            assertThat(number(sql,"SELECT version FROM platform_config")).isEqualTo(8);
            assertPreferencesAndDesktop(sql);
            assertHistoryAndBalances(sql,originalInput);

            // Reapplying the cleanup is a no-op: no extra version bump or lost data.
            sql.execute(Files.readString(Path.of("sql/29_remove_remote_knowledge.sql")));
            assertThat(number(sql,"SELECT version FROM platform_config")).isEqualTo(8);
            assertThat(number(sql,"SELECT version FROM user_preferences WHERE app_users_id=101")).isEqualTo(3);
            assertThat(number(sql,"SELECT version FROM desktop_settings")).isEqualTo(4);
            assertThat(number(sql,"SELECT version FROM session_records WHERE record_id='preserved-record'")).isEqualTo(2);
        }
    }

    @Test
    void migrate_retiredOperationSamples_preservesPgWebAndAnswerTotals() throws Exception {
        try (var connection = connect(); var sql = connection.createStatement()) {
            sql.execute("CREATE SCHEMA cleanup_operations; SET search_path TO cleanup_operations,public");
            sql.execute(Files.readString(Path.of("sql/operations/01_operations.sql")));
            sql.execute("""
                    INSERT INTO operations_histograms(at,stage,source,provider_type,outcome,bucket_ms,sample_count,server_only_count,token_samples)
                    VALUES(LOCALTIMESTAMP,'retrieval.rag','server','bailian','success',100,1,1,0),
                    (LOCALTIMESTAMP,'retrieval.rag','server','pg','success',100,1,1,0),
                    (LOCALTIMESTAMP,'retrieval.web','server','tavily','success',100,1,1,0);
                    INSERT INTO operations_snapshots(name,payload) VALUES('retired','{"providerType":"bailian"}'),('current','{"providerType":"pg"}');
                    INSERT INTO operations_answer_totals VALUES(LOCALTIMESTAMP,'success',5);
                    """);
            seedOperation(sql,"00000000-0000-0000-0000-000000000021","bailian");
            seedOperation(sql,"00000000-0000-0000-0000-000000000022","pg");
            sql.execute(Files.readString(Path.of("sql/operations/02_remove_remote_knowledge.sql")));
            assertThat(number(sql,"SELECT count(*) FROM operations_events")).isEqualTo(1);
            assertThat(number(sql,"SELECT count(*) FROM operations_event_ids")).isEqualTo(1);
            assertThat(number(sql,"SELECT count(*) FROM operations_histograms")).isEqualTo(2);
            assertThat(number(sql,"SELECT count(*) FROM operations_snapshots")).isEqualTo(1);
            assertThat(number(sql,"SELECT sum(sample_count) FROM operations_answer_totals")).isEqualTo(5);
        }
    }

    private void assertPreferencesAndDesktop(Statement sql) throws Exception {
        var preferences = node(sql,"SELECT payload::text FROM user_preferences WHERE app_users_id=101");
        assertThat(preferences.has("remoteKnowledgeEnabled")).isFalse();
        assertThat(preferences.path("platformSelections").has("knowledge")).isFalse();
        assertThat(preferences.path("platformSelections").path("llm").asText()).isEqualTo("llm-model");
        assertThat(preferences.path("retrievalEnabled").asBoolean()).isTrue();
        assertThat(preferences.path("webSearchEnabled").asBoolean()).isTrue();
        assertThat(number(sql,"SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='desktop_settings' AND column_name IN ('retrieval_mode','knowledge_service_id')")).isZero();
        assertThat(number(sql,"SELECT temperature * 10 FROM desktop_settings")).isEqualTo(6);
        sql.execute("INSERT INTO app_users(id,display_name,password_hash) VALUES(102,'new-user','hash'); INSERT INTO user_preferences(app_users_id) VALUES(102)");
        var defaults = node(sql,"SELECT payload::text FROM user_preferences WHERE app_users_id=102");
        assertThat(defaults.has("remoteKnowledgeEnabled")).isFalse();
        assertThat(defaults.path("platformSelections").has("knowledge")).isFalse();
    }

    private void assertHistoryAndBalances(Statement sql,JsonNode originalInput) throws Exception {
        var answer = node(sql,"SELECT content::text FROM session_records WHERE record_id='preserved-record'").path("answers").get(0);
        assertThat(answer.path("modelInput")).isEqualTo(originalInput);
        assertThat(answer.path("question").asText()).isEqualTo("如何设计缓存？");
        assertThat(answer.path("text").asText()).isEqualTo("答案正文保持不变");
        assertThat(answer.path("modelInput").path("messages").get(0).path("content").asText()).isEqualTo("原始问题文本");
        assertThat(answer.path("modelInput").path("remote").path("host").asText()).isEqualTo("original-user-input");
        assertThat(answer.path("modelInput").path("examples").get(0).path("source").asText()).isEqualTo("bailian");
        assertThat(answer.path("modelInput").path("remoteKnowledge").path("original").asBoolean()).isTrue();
        assertThat(answer.path("retrieval").has("remote")).isFalse();
        assertThat(answer.path("retrieval").path("excerpts").size()).isEqualTo(2);
        assertThat(answer.path("retrieval").path("excerpts").get(0).path("source").asText()).isEqualTo("platform");
        assertThat(node(sql,"SELECT background_snapshot::text FROM interview_sessions").has("remoteKnowledge")).isFalse();
        assertThat(node(sql,"SELECT snapshot::text FROM mock_interviews").path("resumeText").asText()).isEqualTo("简历原文");
        assertThat(number(sql,"SELECT available_seconds FROM time_wallets WHERE app_users_id=101")).isEqualTo(4321);
        assertThat(number(sql,"SELECT count(*) FROM reference_documents")).isEqualTo(1);
        assertThat(number(sql,"SELECT count(*) FROM usage_events WHERE capability='knowledge'")).isEqualTo(1);
    }

    private void initializeBusiness() throws Exception {
        var arguments = new ArrayList<>(List.of("psql","-X","-v","ON_ERROR_STOP=1","-U",
                DATABASE.getUsername(),"-d",DATABASE.getDatabaseName()));
        try (var files = Files.list(Path.of("sql"))) {
            for (var file : files.filter(path -> path.getFileName().toString().matches("[0-2][0-9]_.*\\.sql"))
                    .filter(path -> !path.getFileName().toString().startsWith("29_")).sorted().toList()) {
                arguments.add("-f");
                arguments.add("/tmp/sql/" + file.getFileName());
            }
        }
        var result=DATABASE.execInContainer(arguments.toArray(String[]::new));
        assertThat(result.getExitCode()).as(result.getStderr()).isZero();
    }

    private void seedOperation(Statement sql,String id,String provider) throws Exception {
        try (var insert=sql.getConnection().prepareStatement("""
                INSERT INTO operations_events(event_id,operation_id,user_id,stage,source,provider_type,outcome,duration_ms,started_at,payload,server_only,token_sample)
                VALUES(?::uuid,?::uuid,101,'retrieval.rag','server',?,'success',1,LOCALTIMESTAMP,'{}',true,false)
                """)) {
            insert.setString(1,id); insert.setString(2,id); insert.setString(3,provider); insert.executeUpdate();
        }
        try (var insert=sql.getConnection().prepareStatement("INSERT INTO operations_event_ids(event_id) VALUES(?::uuid)")) {
            insert.setString(1,id); insert.executeUpdate();
        }
    }

    private Connection connect() throws Exception {
        return DriverManager.getConnection(DATABASE.getJdbcUrl(),DATABASE.getUsername(),DATABASE.getPassword());
    }

    private JsonNode node(Statement sql,String query) throws Exception {
        try (var result=sql.executeQuery(query)) { result.next(); return json.readTree(result.getString(1)); }
    }

    private long number(Statement sql,String query) throws Exception {
        try (var result=sql.executeQuery(query)) { result.next(); return result.getLong(1); }
    }
}
