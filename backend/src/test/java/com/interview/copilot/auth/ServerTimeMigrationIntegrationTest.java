package com.interview.copilot.auth;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Tag("integration")
@Testcontainers
class ServerTimeMigrationIntegrationTest {
    @Container static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>(DockerImageName
            .parse("interview-copilot-postgres:15.19-pgvector0.8.6").asCompatibleSubstituteFor("postgres"));

    @Test void migration_utcValues_convertsBeijingTimePreservesNullAndPrecisionAndDefaults() throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement()) {
            for (String name : new String[]{"01_schema.sql", "03_admin_users.sql", "04_platform_config.sql", "05_email_auth.sql", "06_display_name.sql", "07_email_code_purpose.sql"}) {
                sql.execute(Files.readString(Path.of("sql", name)));
            }
            sql.execute("SET TIME ZONE 'UTC'");
            sql.execute("INSERT INTO app_users(id,display_name,password_hash,created_at) VALUES(101,'person','hash','2026-09-10 05:30:00.123456+00')");
            sql.execute("INSERT INTO usage_events(app_users_id,request_id,capability,expires_at) VALUES(101,'request','llm','2026-09-10 16:00:00.654321+00')");
            connection.setAutoCommit(false);
            sql.execute(Files.readString(Path.of("sql", "08_server_local_time.sql")));
            connection.commit();

            try (var row = sql.executeQuery("SELECT created_at FROM app_users WHERE id=101")) {
                row.next();
                assertThat(row.getObject(1, LocalDateTime.class)).isEqualTo(LocalDateTime.parse("2026-09-10T13:30:00.123456"));
            }
            try (var row = sql.executeQuery("SELECT expires_at,finished_at FROM usage_events WHERE app_users_id=101")) {
                row.next();
                assertThat(row.getObject(1, LocalDateTime.class)).isEqualTo(LocalDateTime.parse("2026-09-11T00:00:00.654321"));
                assertThat(row.getObject(2)).isNull();
            }
            try (var row = sql.executeQuery("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND data_type='timestamp without time zone' AND datetime_precision=6")) {
                row.next();
                assertThat(row.getInt(1)).isEqualTo(25);
            }
            try (var row = sql.executeQuery("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND data_type='timestamp with time zone'")) {
                row.next();
                assertThat(row.getInt(1)).isZero();
            }
            sql.execute("INSERT INTO app_users(display_name,password_hash) VALUES('default-time','hash')");
            try (var row = sql.executeQuery("SELECT created_at = LOCALTIMESTAMP(6) FROM app_users WHERE display_name='default-time'")) {
                row.next();
                assertThat(row.getBoolean(1)).isTrue();
            }
            connection.commit();
        }
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                var sql = connection.createStatement(); var row = sql.executeQuery("SELECT unnest(setconfig) FROM pg_db_role_setting WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) AND setrole=0")) {
            row.next();
            assertThat(row.getString(1)).isEqualTo("TimeZone=Asia/Shanghai");
        }
    }
}
