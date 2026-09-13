package com.interview.copilot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.user.UserMapper;
import com.interview.copilot.service.usage.UsageService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

@Tag("integration")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(
        classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"copilot.auth.bootstrap-username=", "copilot.auth.bootstrap-password="})
public class BackendIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new SqlInitializedPostgres();

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired TestRestTemplate http;
    @Autowired UserMapper users;
    @Autowired UsageService usage;
    @Autowired com.interview.copilot.service.wallet.WalletService wallets;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired PlatformTransactionManager transactionManager;

    private void beginInterview(long userId) {
        wallets.state(userId);
        jdbc.update("UPDATE time_wallets SET available_seconds=3600 WHERE app_users_id=?", userId);
        wallets.start(userId, java.util.UUID.randomUUID().toString());
    }

    private long alice;
    private long bob;

    @BeforeEach
    void resetDatabase() {
        jdbc.execute("TRUNCATE auth_tokens, usage_events, app_users RESTART IDENTITY CASCADE");
        alice = createUser("alice");
        bob = createUser("bob");
    }

    @Test
    void database_runningServer_matchesPostgresql1519() {
        assertThat(jdbc.queryForObject("SHOW server_version_num", String.class))
                .isEqualTo("150019");
    }

    @Test
    void database_initializedExtension_matchesPgvector086() {
        assertThat(
                        jdbc.queryForObject(
                                "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
                                String.class))
                .isEqualTo("0.8.6");
    }

    @Test
    void database_explicitSqlInitialization_doesNotCreateFlywayHistory() {
        assertThat(
                        jdbc.queryForObject(
                                """
                                SELECT COUNT(*) FROM pg_catalog.pg_class
                                WHERE relname = 'flyway_schema_history' AND relkind IN ('r', 'p')
                                """,
                                Integer.class))
                .isZero();
    }

    @Test
    void vector_knownCoordinates_returnsEuclideanDistancesInOrder() {
        inIsolatedTransaction(
                () -> {
                    jdbc.execute(
                            "CREATE TEMP TABLE vector_distance_probe (embedding vector(3)) ON"
                                    + " COMMIT DROP");
                    jdbc.execute(
                            "INSERT INTO vector_distance_probe VALUES ('[1,2,15]'), ('[4,6,3]'),"
                                    + " ('[1,2,3]')");

                    List<Double> distances =
                            jdbc.queryForList(
                                    """
                                    SELECT embedding <-> '[1,2,3]'::vector AS distance
                                    FROM vector_distance_probe ORDER BY distance
                                    """,
                                    Double.class);

                    assertThat(distances).containsExactly(0.0, 5.0, 12.0);
                });
    }

    @Test
    void vector_hnswIndex_returnsNearestNeighborsUsingIndex() {
        inIsolatedTransaction(
                () -> {
                    jdbc.execute(
                            "CREATE TEMP TABLE vector_hnsw_probe (id integer, embedding vector(3))"
                                    + " ON COMMIT DROP");
                    jdbc.execute(
                            """
INSERT INTO vector_hnsw_probe
SELECT id, ('[' || id || ',0,0]')::vector FROM generate_series(1, 32) AS id
""");
                    jdbc.execute(
                            "CREATE INDEX vector_hnsw_probe_idx ON vector_hnsw_probe USING hnsw"
                                    + " (embedding vector_l2_ops)");
                    jdbc.execute("ANALYZE vector_hnsw_probe");
                    jdbc.execute("SET LOCAL enable_seqscan = off");
                    jdbc.execute("SET LOCAL hnsw.ef_search = 64");
                    String nearest =
                            "SELECT id FROM vector_hnsw_probe ORDER BY embedding <->"
                                    + " '[0,0,0]'::vector LIMIT 3";

                    String plan =
                            String.join(
                                    "\n", jdbc.queryForList("EXPLAIN " + nearest, String.class));
                    List<Integer> neighbors = jdbc.queryForList(nearest, Integer.class);

                    assertThat(plan).contains("Index Scan using vector_hnsw_probe_idx");
                    assertThat(neighbors).containsExactly(1, 2, 3);
                });
    }

    @Test
    void authentication_tokenIsHashedAndLogoutRevokesAccess() {
        String token = login("alice");
        var platform =
                http.exchange(
                        "/api/v1/platform", HttpMethod.GET, authorized(token), JsonNode.class);
        assertThat(platform.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(platform.getBody().at("/user/id").asText()).isEqualTo(Long.toString(alice));
        assertThat(platform.getBody().at("/capabilities/llm").asBoolean()).isFalse();
        assertThat(platform.getBody().toString())
                .doesNotContain("apiKey", "password", "token_hash");
        assertThat(jdbc.queryForObject("SELECT token_hash FROM auth_tokens", String.class))
                .hasSize(64)
                .isNotEqualTo(token);

        var logout =
                http.exchange(
                        "/api/v1/auth/logout", HttpMethod.POST, authorized(token), Void.class);

        assertThat(logout.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(
                        http.exchange(
                                        "/api/v1/platform",
                                        HttpMethod.GET,
                                        authorized(token),
                                        String.class)
                                .getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void authentication_missingOrExpiredToken_isRejectedWhileHealthIsPublic() {
        assertThat(http.getForEntity("/actuator/health", String.class).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(http.getForEntity("/api/v1/platform", String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        String token = login("alice");
        jdbc.update("UPDATE auth_tokens SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");

        assertThat(
                        http.exchange(
                                        "/api/v1/platform",
                                        HttpMethod.GET,
                                        authorized(token),
                                        String.class)
                                .getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void login_wrongPassword_returnsSafeError() {
        var response =
                http.postForEntity(
                        "/api/v1/auth/login",
                        Map.of(
                                "identifier",
                                "alice",
                                "password",
                                "incorrect",
                                "clientType",
                                "desktop"),
                        JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().get("code").asText()).isEqualTo("invalid_credentials");
        assertThat(response.getBody().toString())
                .doesNotContain("SELECT", "password_hash", "jdbc:");
    }

    @Test
    void usage_concurrentStarts_recordsAllWithoutDailyQuota() throws Exception {
        beginInterview(alice);
        beginInterview(bob);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Boolean>> tasks = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            String request = "concurrent-" + index;
            tasks.add(() -> reserveAfter(start, request));
        }
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = tasks.stream().map(executor::submit).toList();
            start.countDown();
            int successful = 0;
            for (var future : futures) if (future.get()) successful++;
            assertThat(successful).isEqualTo(12);
        }
        assertThat(
                        jdbc.queryForObject(
                                "SELECT COUNT(id) FROM usage_events WHERE status = 'complete'",
                                Integer.class))
                .isEqualTo(12);
    }

    @Test
    void usage_duplicateRequest_doesNotReserveTwiceAndOtherUserIsIndependent() {
        beginInterview(alice);
        beginInterview(bob);
        usage.start(alice, "same-request", "llm").complete();

        assertThatThrownBy(() -> usage.start(alice, "same-request", "llm"))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("duplicate_request");
        usage.start(bob, "same-request", "llm").fail();

        assertThat(
                        jdbc.queryForList(
                                "SELECT status FROM usage_events ORDER BY app_users_id",
                                String.class))
                .containsExactly("complete", "failed");
    }

    @Test
    void usage_asrReservation_isPerUserAndCancellationReleasesIt() {
        beginInterview(alice);
        beginInterview(bob);
        UsageLease first = usage.start(alice, "asr-1", "asr");
        usage.start(bob, "asr-1", "asr").complete();
        assertThatThrownBy(() -> usage.start(alice, "asr-2", "asr"))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("quota_exceeded");

        first.cancel();
        usage.start(alice, "asr-2", "asr").complete();

        assertThat(
                        jdbc.queryForList(
                                "SELECT status FROM usage_events WHERE app_users_id = ? ORDER BY"
                                        + " id",
                                String.class,
                                alice))
                .containsExactly("cancelled", "complete");
    }

    @Test
    void usage_expiredReservation_doesNotPermanentlyLockAccount() {
        beginInterview(alice);
        beginInterview(bob);
        usage.start(alice, "old-asr", "asr");
        jdbc.update("UPDATE usage_events SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");

        usage.start(alice, "new-asr", "asr").complete();

        assertThat(jdbc.queryForList("SELECT status FROM usage_events ORDER BY id", String.class))
                .containsExactly("expired", "complete");
    }

    @Test
    void embeddings_authenticatedUser_noPublicVectorEndpoint() {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(login("alice"));
        var response =
                http.postForEntity(
                        "/api/v1/embeddings",
                        new HttpEntity<>(Map.of("input", "私人资料", "serviceId", "vector"), headers),
                        String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    private void inIsolatedTransaction(Runnable assertions) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.executeWithoutResult(
                status -> {
                    assertions.run();
                    status.setRollbackOnly();
                });
    }

    private boolean reserveAfter(CountDownLatch start, String request) throws InterruptedException {
        start.await();
        try (UsageLease reservation = usage.start(alice, request, "llm")) {
            reservation.complete();
            return true;
        } catch (ApiException error) {
            assertThat(error.code()).isEqualTo("quota_exceeded");
            return false;
        }
    }

    private long createUser(String displayName) {
        UserEntity entity = new UserEntity();
        entity.setDisplayName(displayName);
        entity.setEnabled(true);
        entity.setPasswordHash(passwords.encode("test-only-password-2026"));
        users.insert(entity);
        jdbc.update(
                "INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at)"
                        + " VALUES(?,'account',?,CURRENT_TIMESTAMP)",
                entity.getId(),
                displayName);
        return entity.getId();
    }

    private String login(String displayName) {
        var response =
                http.postForEntity(
                        "/api/v1/auth/login",
                        Map.of(
                                "identifier",
                                displayName,
                                "password",
                                "test-only-password-2026",
                                "clientType",
                                "desktop"),
                        JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().get("accessToken").asText();
    }

    private HttpEntity<Void> authorized(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return new HttpEntity<>(headers);
    }

    private static final class SqlInitializedPostgres
            extends PostgreSQLContainer<SqlInitializedPostgres> {
        private SqlInitializedPostgres() {
            super(
                    DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                            .asCompatibleSubstituteFor("postgres"));
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "01_schema.sql")),
                    "/tmp/01_schema.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "02_pgvector.sql")),
                    "/tmp/02_pgvector.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "03_admin_users.sql")),
                    "/tmp/03_admin_users.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "04_platform_config.sql")),
                    "/tmp/04_platform_config.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "05_email_auth.sql")),
                    "/tmp/05_email_auth.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "06_display_name.sql")),
                    "/tmp/06_display_name.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "07_email_code_purpose.sql")),
                    "/tmp/07_email_code_purpose.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "08_server_local_time.sql")),
                    "/tmp/08_server_local_time.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "09_pg_references.sql")),
                    "/tmp/09_pg_references.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "10_time_wallet.sql")),
                    "/tmp/10_time_wallet.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "16_desktop_sessions.sql")),
                    "/tmp/16_desktop_sessions.sql");
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", "17_desktop_settings.sql")),
                    "/tmp/17_desktop_settings.sql");
        }

        @Override
        protected void containerIsStarted(InspectContainerResponse containerInfo) {
            super.containerIsStarted(containerInfo);
            initializeDatabase();
        }

        private void initializeDatabase() {
            try {
                var result =
                        execInContainer(
                                "psql",
                                "-X",
                                "-v",
                                "ON_ERROR_STOP=1",
                                "--single-transaction",
                                "--username",
                                getUsername(),
                                "--dbname",
                                getDatabaseName(),
                                "-f",
                                "/tmp/01_schema.sql",
                                "-f",
                                "/tmp/02_pgvector.sql",
                                "-f",
                                "/tmp/03_admin_users.sql",
                                "-f",
                                "/tmp/04_platform_config.sql",
                                "-f",
                                "/tmp/05_email_auth.sql",
                                "-f",
                                "/tmp/06_display_name.sql",
                                "-f",
                                "/tmp/07_email_code_purpose.sql",
                                "-f",
                                "/tmp/08_server_local_time.sql",
                                "-f",
                                "/tmp/09_pg_references.sql",
                                "-f",
                                "/tmp/10_time_wallet.sql",
                                "-f",
                                "/tmp/16_desktop_sessions.sql",
                                "-f",
                                "/tmp/17_desktop_settings.sql");
                if (result.getExitCode() != 0) {
                    throw new IllegalStateException(
                            "Database SQL initialization failed: " + result.getStderr());
                }
            } catch (IOException error) {
                throw new IllegalStateException(
                        "Could not execute database initialization SQL", error);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(
                        "Database SQL initialization was interrupted", error);
            }
        }
    }
}
