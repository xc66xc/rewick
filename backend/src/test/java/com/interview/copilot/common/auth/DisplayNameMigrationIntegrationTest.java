package com.interview.copilot.common.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

@Tag("integration")
@Testcontainers
public class DisplayNameMigrationIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> DATABASE =
            new PostgreSQLContainer<>(
                    DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                            .asCompatibleSubstituteFor("postgres"));

    @Test
    void migration_existingEmailAndAdmin_preservesIdsTokensAndLoginAndAllowsDuplicateDisplayNames()
            throws Exception {
        try (var connection =
                        DriverManager.getConnection(
                                DATABASE.getJdbcUrl(),
                                DATABASE.getUsername(),
                                DATABASE.getPassword());
                var sql = connection.createStatement()) {
            for (String name :
                    new String[] {
                        "01_schema.sql",
                        "03_admin_users.sql",
                        "04_platform_config.sql",
                        "05_email_auth.sql"
                    }) {
                sql.execute(Files.readString(Path.of("sql", name)));
            }
            sql.execute(
                    "INSERT INTO app_users(id,username,password_hash,role)"
                        + " VALUES(101,'administrator','preserved-hash','ADMIN'),(102,'u_random','email-hash','USER')");
            sql.execute(
                    "INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at)"
                            + " VALUES(102,'email','person@example.com',CURRENT_TIMESTAMP)");
            sql.execute(
                    "INSERT INTO auth_tokens(app_users_id,token_hash,expires_at) VALUES(101,'"
                            + "a".repeat(64)
                            + "',CURRENT_TIMESTAMP+INTERVAL '1 day')");
            connection.setAutoCommit(false);
            sql.execute(Files.readString(Path.of("sql", "06_display_name.sql")));
            connection.commit();
            try (var row =
                    sql.executeQuery(
                            "SELECT u.id,u.display_name,u.password_hash,i.identifier FROM app_users"
                                + " u JOIN auth_identities i ON i.app_users_id=u.id WHERE"
                                + " i.identity_type='account' AND i.identifier='administrator'")) {
                assertThat(row.next()).isTrue();
                assertThat(row.getLong(1)).isEqualTo(101);
                assertThat(row.getString(2)).isEqualTo("administrator");
                assertThat(row.getString(3)).isEqualTo("preserved-hash");
            }
            try (var row = sql.executeQuery("SELECT display_name FROM app_users WHERE id=102")) {
                assertThat(row.next()).isTrue();
                assertThat(row.getString(1)).isEqualTo("person@example.com");
            }
            try (var row =
                    sql.executeQuery("SELECT COUNT(*) FROM auth_tokens WHERE app_users_id=101")) {
                row.next();
                assertThat(row.getInt(1)).isEqualTo(1);
            }
            sql.execute(
                    "INSERT INTO app_users(display_name,password_hash)"
                            + " VALUES('administrator','different-hash')");
            try (var row =
                    sql.executeQuery(
                            "SELECT COUNT(*) FROM information_schema.columns WHERE"
                                    + " table_name='app_users' AND column_name='username'")) {
                row.next();
                assertThat(row.getInt(1)).isZero();
            }
            connection.rollback();
        }
    }
}
