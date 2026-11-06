package com.interview.copilot.model.platform;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("integration")
@Testcontainers
class SessionRecordLimitSchemaIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>(
            DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                    .asCompatibleSubstituteFor("postgres"));

    @Test
    void migrate_singletonPolicy_preservesDefaultsAndValidatesRangeIdempotently() throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(),
                DATABASE.getUsername(), DATABASE.getPassword()); var sql = connection.createStatement()) {
            sql.execute("CREATE TABLE app_users (id BIGINT PRIMARY KEY)");
            sql.execute(Files.readString(Path.of("sql/17_desktop_settings.sql")));
            sql.execute(Files.readString(Path.of("sql/30_session_record_limit.sql")));
            sql.execute(Files.readString(Path.of("sql/30_session_record_limit.sql")));
            assertThat(value(sql, "SELECT session_record_max_mib FROM desktop_settings WHERE id=1")).isEqualTo("20");
            assertThat(value(sql, "SELECT count(*) FROM desktop_settings")).isEqualTo("1");
            for (int limit : new int[]{1, 50}) {
                sql.executeUpdate("UPDATE desktop_settings SET session_record_max_mib=" + limit + " WHERE id=1");
                assertThat(value(sql, "SELECT session_record_max_mib FROM desktop_settings WHERE id=1"))
                        .isEqualTo(String.valueOf(limit));
            }
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE desktop_settings SET session_record_max_mib=0 WHERE id=1"))
                    .isInstanceOf(SQLException.class).hasMessageContaining("desktop_session_record_limit");
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE desktop_settings SET session_record_max_mib=51 WHERE id=1"))
                    .isInstanceOf(SQLException.class).hasMessageContaining("desktop_session_record_limit");
            sql.executeUpdate("UPDATE desktop_settings SET session_record_max_mib=20 WHERE id=1");
            assertThat(value(sql, "SELECT version FROM desktop_settings WHERE id=1")).isEqualTo("0");
            sql.execute("ANALYZE desktop_settings");
            logPlan(sql, "SELECT version,llm_model_id,temperature,asr_service_id,session_record_max_mib FROM desktop_settings WHERE id=1");
            connection.setAutoCommit(false);
            logPlan(sql, "UPDATE desktop_settings SET version=version+1,llm_model_id='',temperature=0.7,asr_service_id='',session_record_max_mib=20,updated_at=LOCALTIMESTAMP(6) WHERE id=1 AND version=0");
            connection.rollback();
        }
    }

    private void logPlan(Statement sql, String query) throws SQLException {
        var lines = new java.util.ArrayList<String>();
        try (var result = sql.executeQuery("EXPLAIN (ANALYZE, BUFFERS) " + query)) {
            while (result.next()) lines.add(result.getString(1));
        }
        assertThat(String.join("\n", lines)).contains("rows=1");
        LoggerFactory.getLogger(getClass()).info("Session policy SQL plan: {}", String.join("; ", lines));
    }

    private String value(Statement sql, String query) throws SQLException {
        try (var result = sql.executeQuery(query)) {
            result.next();
            return result.getString(1);
        }
    }
}
