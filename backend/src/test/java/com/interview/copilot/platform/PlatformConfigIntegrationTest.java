package com.interview.copilot.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.dockerjava.api.command.InspectContainerResponse;
import com.interview.copilot.admin.audit.AuditService;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.common.ApiException;
import java.io.IOException;
import java.nio.file.Path;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

@Tag("integration")
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "copilot.auth.bootstrap-username=", "copilot.auth.bootstrap-password=",
        "copilot.auth.admin.bootstrap-username=", "copilot.auth.admin.bootstrap-password="})
class PlatformConfigIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new ConfigDatabase();
    @Autowired PlatformConfigService service;
    @Autowired PlatformConfigMapper mapper;
    @Autowired PlatformConfigCodec codec;
    @Autowired PlatformConfigValidator validator;
    @Autowired ProviderProperties properties;
    @Autowired AuditService audit;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("copilot.platform.master-key", () -> PlatformConfigFixture.MASTER_KEY);
    }

    @BeforeEach void reset() {
        jdbc.execute("TRUNCATE audit_events, auth_tokens, usage_events, usage_daily, app_users RESTART IDENTITY CASCADE");
        jdbc.update("UPDATE platform_config SET version = 0, is_published = FALSE, payload = '{}'::jsonb WHERE id = 1");
        jdbc.update("INSERT INTO app_users(display_name, password_hash, role) VALUES ('admin-config-test', 'unused-fixture-hash', 'ADMIN')");
    }

    @Test void publish_realDatabase_encryptsSecretsAndRebuiltResolverReadsCommittedConfiguration() {
        service.publish(1, PlatformConfigFixture.config(0, "database-fixture-secret"));

        String persisted = jdbc.queryForObject("SELECT payload::text FROM platform_config WHERE id = 1", String.class);
        PlatformConfigService reloaded = new PlatformConfigService(mapper, codec, validator, properties, audit);
        var route = reloaded.snapshot().llm("careful");

        assertThat(persisted).contains("encryptedKey", "v1:").doesNotContain("database-fixture-secret");
        assertThat(route.config().getModel()).isEqualTo("upstream-careful");
        assertThat(route.config().getApiKey()).isEqualTo("database-fixture-secret");
        assertThat(reloaded.get().providers().getFirst().apiKey()).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action = 'platform.config.publish'", Integer.class)).isEqualTo(1);
    }

    @Test void publish_sameVersionConcurrently_commitsExactlyOneVersionAndAudit() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(publishAfter(start, "first-fixture-secret"));
            var second = executor.submit(publishAfter(start, "second-fixture-secret"));
            start.countDown();

            assertThat(first.get() ^ second.get()).isTrue();
        }
        assertThat(jdbc.queryForObject("SELECT version FROM platform_config WHERE id = 1", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events", Integer.class)).isEqualTo(1);
    }

    private Callable<Boolean> publishAfter(CountDownLatch start, String key) {
        return () -> {
            start.await();
            try { service.publish(1, PlatformConfigFixture.config(0, key)); return true; }
            catch (ApiException error) {
                assertThat(error.code()).isEqualTo("CONFIG_VERSION_CONFLICT");
                return false;
            }
        };
    }

    private static final class ConfigDatabase extends PostgreSQLContainer<ConfigDatabase> {
        private ConfigDatabase() {
            super(DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6").asCompatibleSubstituteFor("postgres"));
            withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql")), "/tmp/copilot-sql");
        }

        @Override protected void containerIsStarted(InspectContainerResponse containerInfo) {
            super.containerIsStarted(containerInfo);
            try {
                var result = execInContainer("psql", "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction",
                        "-U", getUsername(), "-d", getDatabaseName(), "-f", "/tmp/copilot-sql/01_schema.sql",
                        "-f", "/tmp/copilot-sql/02_pgvector.sql", "-f", "/tmp/copilot-sql/03_admin_users.sql",
                        "-f", "/tmp/copilot-sql/04_platform_config.sql", "-f", "/tmp/copilot-sql/05_email_auth.sql", "-f", "/tmp/copilot-sql/06_display_name.sql", "-f", "/tmp/copilot-sql/07_email_code_purpose.sql", "-f", "/tmp/copilot-sql/08_server_local_time.sql", "-f", "/tmp/copilot-sql/09_pg_references.sql");
                if (result.getExitCode() != 0) { throw new IllegalStateException("Test SQL initialization failed: " + result.getStderr()); }
            } catch (IOException error) { throw new IllegalStateException("Test SQL could not execute", error); }
            catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Test SQL initialization interrupted", error);
            }
        }
    }
}
