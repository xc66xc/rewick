package com.interview.copilot.common.wallet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.dockerjava.api.command.InspectContainerResponse;
import com.interview.copilot.dto.wallet.WalletAdjustment;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.service.wallet.WalletAdminService;
import com.interview.copilot.service.wallet.WalletService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

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
public class WalletIntegrationTest {
    @Container static final PostgreSQLContainer<?> DATABASE = new WalletDatabase();
    @Autowired WalletService wallets;
    @Autowired UsageService usage;
    @Autowired WalletAdminService admin;
    @Autowired JdbcTemplate jdbc;
    @Autowired MutableClock clock;

    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    com.interview.copilot.mapper.wallet.WalletMapper walletMapper;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", DATABASE::getUsername);
        properties.add("spring.datasource.password", DATABASE::getPassword);
    }

    @BeforeEach
    void prepare() {
        jdbc.execute("TRUNCATE app_users RESTART IDENTITY CASCADE");
        jdbc.execute(
                "INSERT INTO app_users(display_name,password_hash,role)"
                    + " VALUES('alice','fixture','USER'),('bob','fixture','USER'),('administrator','fixture','ADMIN')");
        clock.set(Instant.parse("2026-09-11T00:00:00Z"));
        org.mockito.Mockito.doAnswer(invocation -> com.interview.copilot.util.ServerTime.now(clock))
                .when(walletMapper)
                .now();
    }

    @Test
    void start_zeroBalance_isRejectedAndLeavesNoSession() {
        assertThat(wallets.state(1).availableSeconds()).isZero();
        assertThatThrownBy(() -> wallets.start(1, request())).isInstanceOf(ApiException.class);
        assertThat(count("interview_sessions")).isZero();
        assertThat(count("time_wallet_transactions")).isZero();
    }

    @Test
    void start_sameRequest_returnsSameSessionAndDoesNotDebit() {
        grant(1, 120);
        String requestId = request();
        var first = wallets.start(1, requestId);
        var retry = wallets.start(1, requestId);

        assertThat(retry.session().id()).isEqualTo(first.session().id());
        assertThat(retry.availableSeconds()).isEqualTo(120);
        assertThat(retry.session().expiresAt()).isEqualTo(first.serverTime().plusSeconds(30));
        assertThat(count("interview_sessions")).isEqualTo(1);
        assertThat(count("time_wallet_transactions")).isZero();
    }

    @Test
    void state_multipleSessions_selectsLatestRecordRatherThanUuidOrder() {
        grant(1, 120);
        var first = wallets.start(1, request());
        wallets.end(1, first.session().id());
        jdbc.update(
                "UPDATE interview_sessions SET session_id=? WHERE session_id=?",
                "ffffffff-ffff-ffff-ffff-ffffffffffff",
                first.session().id());
        var latest = wallets.start(1, request());

        assertThat(wallets.state(1).session().id()).isEqualTo(latest.session().id());
    }

    @Test
    void start_parallelDifferentRequests_onlyOneActiveInterview() throws Exception {
        grant(1, 120);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int index = 0; index < 8; index++)
                tasks.add(
                        executor.submit(
                                () -> {
                                    start.await();
                                    try {
                                        wallets.start(1, request());
                                        return true;
                                    } catch (ApiException error) {
                                        return false;
                                    }
                                }));
            start.countDown();
            int accepted = 0;
            for (var task : tasks) if (task.get()) accepted++;
            assertThat(accepted).isEqualTo(1);
        }
        assertThat(count("interview_sessions")).isEqualTo(1);
    }

    @Test
    void heartbeat_fractionalIntervals_debitsCumulativeWholeSecondsExactlyOnce() {
        grant(1, 120);
        String id = wallets.start(1, request()).session().id();
        clock.advance(Duration.ofMillis(10900));
        assertThat(wallets.heartbeat(1, id).availableSeconds()).isEqualTo(110);
        assertThat(wallets.heartbeat(1, id).availableSeconds()).isEqualTo(110);
        clock.advance(Duration.ofMillis(9300));
        var state = wallets.heartbeat(1, id);

        assertThat(state.session().usedSeconds()).isEqualTo(20);
        assertThat(state.availableSeconds()).isEqualTo(100);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT SUM(delta_seconds) FROM time_wallet_transactions",
                                Long.class))
                .isEqualTo(-20);
        assertThat(count("time_wallet_transactions")).isEqualTo(2);
    }

    @Test
    void end_repeatedAndFractionalSecond_stopsOnceAndFloorsDuration() {
        grant(1, 120);
        String id = wallets.start(1, request()).session().id();
        clock.advance(Duration.ofMillis(12750));
        var ended = wallets.end(1, id);
        clock.advance(Duration.ofHours(1));
        var retry = wallets.end(1, id);

        assertThat(ended.session().status()).isEqualTo("ended");
        assertThat(ended.availableSeconds()).isEqualTo(108);
        assertThat(retry.availableSeconds()).isEqualTo(108);
        assertThat(retry.session().endedAt()).isEqualTo(ended.session().endedAt());
        assertThat(count("time_wallet_transactions")).isEqualTo(1);
        assertThatThrownBy(() -> usage.start(1, "after-end", "llm"))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void heartbeat_expiredLease_doesNotReviveOrChargePastExpiry() {
        grant(1, 120);
        String id = wallets.start(1, request()).session().id();
        clock.advance(Duration.ofHours(2));
        assertThat(wallets.heartbeat(1, id).session().status()).isEqualTo("ended");
        var ended = wallets.state(1);

        assertThat(ended.session().status()).isEqualTo("ended");
        assertThat(ended.session().usedSeconds()).isEqualTo(30);
        assertThat(ended.availableSeconds()).isEqualTo(90);
        assertThat(wallets.isActive(1, id)).isFalse();
        assertThat(wallets.state(1).availableSeconds()).isEqualTo(90);
    }

    @Test
    void heartbeat_shortReconnect_keepsSessionAndChargesGap() {
        grant(1, 120);
        String id = wallets.start(1, request()).session().id();
        clock.advance(Duration.ofSeconds(10));
        wallets.heartbeat(1, id);
        clock.advance(Duration.ofSeconds(25));
        var recovered = wallets.heartbeat(1, id);

        assertThat(recovered.session().id()).isEqualTo(id);
        assertThat(recovered.session().status()).isEqualTo("active");
        assertThat(recovered.session().usedSeconds()).isEqualTo(35);
        assertThat(recovered.availableSeconds()).isEqualTo(85);
    }

    @Test
    void start_smallBalance_capsLeaseAndCannotBecomeNegative() {
        grant(1, 3);
        var started = wallets.start(1, request());
        assertThat(started.session().expiresAt()).isEqualTo(started.serverTime().plusSeconds(3));
        clock.advance(Duration.ofSeconds(60));
        var state = wallets.state(1);

        assertThat(state.availableSeconds()).isZero();
        assertThat(state.session().usedSeconds()).isEqualTo(3);
        assertThat(state.session().status()).isEqualTo("ended");
        assertThatThrownBy(() -> wallets.start(1, request())).isInstanceOf(ApiException.class);
    }

    @Test
    void heartbeat_foreignSession_rejectsWithoutChangingEitherWallet() {
        grant(1, 120);
        grant(2, 60);
        String id = wallets.start(1, request()).session().id();

        assertThatThrownBy(() -> wallets.heartbeat(2, id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> wallets.end(2, id)).isInstanceOf(ApiException.class);
        assertThat(wallets.isActive(2, id)).isFalse();
        assertThat(wallets.state(2).availableSeconds()).isEqualTo(60);
        assertThat(wallets.state(1).availableSeconds()).isEqualTo(120);
    }

    @Test
    void start_endedRequestRetry_doesNotCreateNewInterview() {
        grant(1, 120);
        String requestId = request();
        String id = wallets.start(1, requestId).session().id();
        wallets.end(1, id);
        var retry = wallets.start(1, requestId);

        assertThat(retry.session().id()).isEqualTo(id);
        assertThat(retry.session().status()).isEqualTo("ended");
        assertThat(count("interview_sessions")).isEqualTo(1);
        assertThat(wallets.start(1, request()).session().id()).isNotEqualTo(id);
    }

    @Test
    void adjust_sameRequest_isIdempotentAndRecordsActorAndReason() {
        grant(1, 120);
        var adjustment =
                new WalletAdjustment(request(), "add", 60L, wallets.state(1).version(), "测试分配");
        admin.adjust(3, 1, adjustment);
        var retry = admin.adjust(3, 1, adjustment);

        assertThat(retry.availableSeconds()).isEqualTo(180);
        assertThat(count("time_wallet_transactions")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT reason FROM time_wallet_transactions", String.class))
                .isEqualTo("测试分配");
        assertThat(jdbc.queryForObject("SELECT actor_id FROM time_wallet_transactions", Long.class))
                .isEqualTo(3L);
    }

    @Test
    void adjust_staleSetVersion_rejectsWithoutOverwritingNewBalance() {
        grant(1, 120);
        long version = wallets.state(1).version();
        admin.adjust(3, 1, new WalletAdjustment(request(), "set", 240L, version, "first"));

        assertThatThrownBy(
                        () ->
                                admin.adjust(
                                        3,
                                        1,
                                        new WalletAdjustment(
                                                request(), "set", 300L, version, "stale")))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("wallet_version_conflict");
        assertThat(wallets.state(1).availableSeconds()).isEqualTo(240);
        assertThat(count("time_wallet_transactions")).isEqualTo(1);
    }

    @Test
    void adjust_zeroDuringInterview_settlesElapsedThenEndsSession() {
        grant(1, 120);
        String id = wallets.start(1, request()).session().id();
        clock.advance(Duration.ofSeconds(11));
        long version = wallets.state(1).version();
        var adjusted =
                admin.adjust(3, 1, new WalletAdjustment(request(), "set", 0L, version, "结束额度"));

        assertThat(adjusted.availableSeconds()).isZero();
        assertThat(adjusted.session().status()).isEqualTo("ended");
        assertThat(adjusted.session().usedSeconds()).isEqualTo(11);
        assertThat(wallets.isActive(1, id)).isFalse();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT SUM(delta_seconds) FROM time_wallet_transactions",
                                Long.class))
                .isEqualTo(-120);
    }

    @Test
    void adjust_ledgerInsertFailure_rollsBackWalletBalance() {
        grant(1, 120);
        jdbc.execute(
                "ALTER TABLE time_wallet_transactions ADD CONSTRAINT reject_adjustment CHECK"
                        + " (operation <> 'add')");
        try {
            assertThatThrownBy(
                            () ->
                                    admin.adjust(
                                            3,
                                            1,
                                            new WalletAdjustment(
                                                    request(), "add", 60L, 0L, "rollback")))
                    .isInstanceOf(org.springframework.dao.DataAccessException.class);
            assertThat(wallets.state(1).availableSeconds()).isEqualTo(120);
            assertThat(wallets.state(1).version()).isZero();
            assertThat(count("time_wallet_transactions")).isZero();
        } finally {
            jdbc.execute("ALTER TABLE time_wallet_transactions DROP CONSTRAINT reject_adjustment");
        }
    }

    @Test
    void adjust_ordinaryUser_isForbiddenWithoutChangingWallet() {
        grant(1, 120);
        assertThatThrownBy(
                        () ->
                                admin.adjust(
                                        2,
                                        1,
                                        new WalletAdjustment(
                                                request(), "add", 60L, 0L, "invalid actor")))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("forbidden");
        assertThat(wallets.state(1).availableSeconds()).isEqualTo(120);
    }

    private void grant(long userId, long seconds) {
        wallets.state(userId);
        jdbc.update(
                "UPDATE time_wallets SET available_seconds=? WHERE app_users_id=?",
                seconds,
                userId);
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
    }

    private String request() {
        return UUID.randomUUID().toString();
    }

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        MutableClock mutableClock() {
            return new MutableClock();
        }
    }

    static final class MutableClock extends Clock {
        private final AtomicReference<Instant> now =
                new AtomicReference<>(Instant.parse("2026-09-11T00:00:00Z"));

        void set(Instant instant) {
            now.set(instant);
        }

        void advance(Duration duration) {
            now.updateAndGet(value -> value.plus(duration));
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    }

    private static final class WalletDatabase extends PostgreSQLContainer<WalletDatabase> {
        private static final List<String> SCRIPTS =
                List.of(
                        "01_schema.sql",
                        "02_pgvector.sql",
                        "03_admin_users.sql",
                        "04_platform_config.sql",
                        "05_email_auth.sql",
                        "06_display_name.sql",
                        "07_email_code_purpose.sql",
                        "08_server_local_time.sql",
                        "09_pg_references.sql",
                        "25_reference_hybrid.sql",
                        "10_time_wallet.sql",
                        "16_desktop_sessions.sql",
                        "17_desktop_settings.sql");

        WalletDatabase() {
            super(
                    DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                            .asCompatibleSubstituteFor("postgres"));
            withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql")), "/tmp/sql");
        }

        @Override
        protected void containerIsStarted(InspectContainerResponse info) {
            var args =
                    new ArrayList<>(
                            List.of(
                                    "psql",
                                    "-v",
                                    "ON_ERROR_STOP=1",
                                    "-U",
                                    getUsername(),
                                    "-d",
                                    getDatabaseName()));
            for (String script : SCRIPTS) {
                args.add("-f");
                args.add("/tmp/sql/" + script);
            }
            try {
                var result = execInContainer(args.toArray(String[]::new));
                if (result.getExitCode() != 0) throw new IllegalStateException(result.getStderr());
            } catch (Exception error) {
                throw new IllegalStateException("Wallet test database setup failed", error);
            }
        }
    }
}
