package com.interview.copilot.model.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.dockerjava.api.command.InspectContainerResponse;
import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.converter.platform.PlatformConfigCodec;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.platform.PlatformConfigMapper;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.impl.platform.PlatformConfigServiceImpl;
import com.interview.copilot.service.platform.PlatformConfigService;
import com.interview.copilot.validation.platform.PlatformConfigValidator;

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

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 验证平台服务发布与桌面默认服务切换的事务一致性。
 */
@Tag("integration")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(
        classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "copilot.auth.bootstrap-username=", "copilot.auth.bootstrap-password=",
            "copilot.auth.admin.bootstrap-username=", "copilot.auth.admin.bootstrap-password="
        })
public class PlatformConfigIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new ConfigDatabase();
    @Autowired PlatformConfigService service;
    @Autowired PlatformConfigMapper mapper;
    @Autowired PlatformConfigCodec codec;
    @Autowired PlatformConfigValidator validator;
    @Autowired ProviderProperties properties;
    @Autowired AuditService audit;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("copilot.platform.master-key", () -> PlatformConfigFixture.MASTER_KEY);
    }

    @BeforeEach
    void reset() {
        jdbc.update("UPDATE desktop_settings SET version=0,llm_model_id='',asr_service_id='',retrieval_mode='local',knowledge_service_id='' WHERE id=1");
        jdbc.execute(
                "TRUNCATE audit_events, auth_tokens, usage_events, app_users RESTART IDENTITY"
                        + " CASCADE");
        jdbc.update(
                "UPDATE platform_config SET version = 0, is_published = FALSE, payload ="
                        + " '{}'::jsonb WHERE id = 1");
        jdbc.update(
                "INSERT INTO app_users(display_name, password_hash, role) VALUES"
                        + " ('admin-config-test', 'unused-fixture-hash', 'ADMIN')");
    }

    @Test
    void publish_realDatabase_encryptsSecretsAndRebuiltResolverReadsCommittedConfiguration() {
        service.publish(1, PlatformConfigFixture.config(0, "database-fixture-secret"));

        String persisted =
                jdbc.queryForObject(
                        "SELECT payload::text FROM platform_config WHERE id = 1", String.class);
        PlatformConfigService reloaded =
                new PlatformConfigServiceImpl(mapper, codec, validator, properties, audit);
        var route = reloaded.snapshot().llm("careful");

        assertThat(persisted)
                .contains("encryptedKey", "v1:")
                .doesNotContain("database-fixture-secret");
        assertThat(route.config().getModel()).isEqualTo("upstream-careful");
        assertThat(route.config().getApiKey()).isEqualTo("database-fixture-secret");
        assertThat(reloaded.get().providers().getFirst().apiKey()).isNull();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT COUNT(*) FROM audit_events WHERE action ="
                                        + " 'platform.config.publish'",
                                Integer.class))
                .isEqualTo(1);
    }

    @Test
    void publish_sameVersionConcurrently_commitsExactlyOneVersionAndAudit() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(publishAfter(start, "first-fixture-secret"));
            var second = executor.submit(publishAfter(start, "second-fixture-secret"));
            start.countDown();

            assertThat(first.get() ^ second.get()).isTrue();
        }
        assertThat(
                        jdbc.queryForObject(
                                "SELECT version FROM platform_config WHERE id = 1", Long.class))
                .isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void publish_replacingDefaultAsr_updatesBothVersionsAtomically() {
        prepareDefaultAsr();
        service.publish(1, asrConfig(1, "new-asr", true));
        assertThat(service.get().asr().providerId()).isEqualTo("new-asr");
        assertThat(mapper.desktopDefaults().asrServiceId()).isEqualTo("new-asr");
        assertThat(mapper.desktopDefaults().version()).isEqualTo(1);
        assertThat(service.get().version()).isEqualTo(2);
    }

    @Test
    void publish_disablingDefaultAsrWithoutReplacement_rejectsAndKeepsDefaults() {
        prepareDefaultAsr();
        assertThatThrownBy(() -> service.publish(1, asrConfig(1, "old-asr", false)))
                .isInstanceOf(ApiException.class).extracting("code")
                .isEqualTo("DESKTOP_DEFAULT_UNAVAILABLE");
        assertThat(mapper.desktopDefaults().asrServiceId()).isEqualTo("old-asr");
        assertThat(service.get().version()).isEqualTo(1);
    }

    @Test
    void publish_auditFails_rollsBackBothConfigurationAndDefault() {
        prepareDefaultAsr();
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT reject_switch_test CHECK (action <> 'desktop.defaults.update')");
        try {
            assertThatThrownBy(() -> service.publish(1, asrConfig(1, "new-asr", true)))
                    .isInstanceOf(RuntimeException.class);
            assertThat(service.get().asr().providerId()).isEqualTo("old-asr");
            assertThat(service.get().version()).isEqualTo(1);
            assertThat(mapper.desktopDefaults().asrServiceId()).isEqualTo("old-asr");
            assertThat(mapper.desktopDefaults().version()).isZero();
        } finally {
            jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT reject_switch_test");
        }
    }

    @Test
    void publish_noExplicitDefault_doesNotAssignOneDuringReplacement() {
        service.publish(1, asrConfig(0, "old-asr", true));
        service.publish(1, asrConfig(1, "new-asr", true));
        assertThat(mapper.desktopDefaults().asrServiceId()).isEmpty();
        assertThat(mapper.desktopDefaults().version()).isZero();
    }

    @Test
    void publish_searchConfig_databaseEncryptsKeyAndLegacyAdminSavePreservesSettings() {
        var base = PlatformConfigFixture.config(0, "fixture-model-key");
        var providers = new ArrayList<>(base.providers());
        providers.add(new PlatformConfig.Provider("tavily", "Search", "web-search",
                "https://api.tavily.com/search", true, false, "fixture-search-key"));
        service.publish(1, new PlatformConfig(0, providers, base.models(), base.defaultModelId(),
                base.asr(), base.knowledge(), base.embedding(), new PlatformConfig.WebSearch(true, "tavily", 7, "basic", 2000)));
        var saved = service.get();
        new com.interview.copilot.service.impl.platform.AdminPlatformConfigServiceImpl(service).publish(1,
                new com.interview.copilot.request.platform.PlatformConfigRequest(saved.version(), saved.providers(),
                        saved.models(), saved.defaultModelId(), saved.asr(), saved.knowledge(), saved.embedding(), null));
        String payload = jdbc.queryForObject("SELECT payload::text FROM platform_config WHERE id=1", String.class);
        assertThat(payload).contains("v1:").doesNotContain("fixture-search-key");
        assertThat(service.get().webSearch().topK()).isEqualTo(7);
        assertThat(service.snapshot().webSearch().apiKey()).isEqualTo("fixture-search-key");
        assertThat(service.snapshot().llm("fast").config().getApiKey()).isEqualTo("fixture-model-key");
        assertThat(service.get().version()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action='platform.config.publish'", Integer.class)).isEqualTo(2);
    }

    private void prepareDefaultAsr() {
        service.publish(1, asrConfig(0, "old-asr", true));
        jdbc.update("UPDATE desktop_settings SET asr_service_id='old-asr' WHERE id=1");
    }

    private PlatformConfig asrConfig(long version, String id, boolean enabled) {
        PlatformConfig base = PlatformConfigFixture.config(version, "fixture-key");
        var providers = new ArrayList<>(base.providers());
        providers.add(new PlatformConfig.Provider(id, id, "asr",
                "wss://example.test/asr", enabled, false, "fixture-asr-key"));
        return new PlatformConfig(version, providers, base.models(), base.defaultModelId(),
                new PlatformConfig.Asr(enabled, id, "paraformer-realtime-v1"), base.knowledge());
    }

    private Callable<Boolean> publishAfter(CountDownLatch start, String key) {
        return () -> {
            start.await();
            try {
                service.publish(1, PlatformConfigFixture.config(0, key));
                return true;
            } catch (ApiException error) {
                assertThat(error.code()).isEqualTo("CONFIG_VERSION_CONFLICT");
                return false;
            }
        };
    }

    private static final class ConfigDatabase extends PostgreSQLContainer<ConfigDatabase> {
        private ConfigDatabase() {
            super(
                    DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                            .asCompatibleSubstituteFor("postgres"));
            withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql")), "/tmp/copilot-sql");
        }

        @Override
        protected void containerIsStarted(InspectContainerResponse containerInfo) {
            super.containerIsStarted(containerInfo);
            try {
                var result =
                        execInContainer(
                                "psql",
                                "-X",
                                "-v",
                                "ON_ERROR_STOP=1",
                                "--single-transaction",
                                "-U",
                                getUsername(),
                                "-d",
                                getDatabaseName(),
                                "-f",
                                "/tmp/copilot-sql/01_schema.sql",
                                "-f",
                                "/tmp/copilot-sql/02_pgvector.sql",
                                "-f",
                                "/tmp/copilot-sql/03_admin_users.sql",
                                "-f",
                                "/tmp/copilot-sql/04_platform_config.sql",
                                "-f",
                                "/tmp/copilot-sql/05_email_auth.sql",
                                "-f",
                                "/tmp/copilot-sql/06_display_name.sql",
                                "-f",
                                "/tmp/copilot-sql/07_email_code_purpose.sql",
                                "-f",
                                "/tmp/copilot-sql/08_server_local_time.sql",
                                "-f",
                                "/tmp/copilot-sql/09_pg_references.sql",
                                "-f",
                                "/tmp/copilot-sql/10_time_wallet.sql",
                                "-f",
                                "/tmp/copilot-sql/16_desktop_sessions.sql",
                                "-f",
                                "/tmp/copilot-sql/17_desktop_settings.sql");
                if (result.getExitCode() != 0) {
                    throw new IllegalStateException(
                            "Test SQL initialization failed: " + result.getStderr());
                }
            } catch (IOException error) {
                throw new IllegalStateException("Test SQL could not execute", error);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Test SQL initialization interrupted", error);
            }
        }
    }
}
