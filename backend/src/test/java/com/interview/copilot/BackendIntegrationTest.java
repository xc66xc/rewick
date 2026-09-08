package com.interview.copilot;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.auth.UserEntity;
import com.interview.copilot.auth.UserMapper;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("integration")
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "copilot.auth.bootstrap-username=", "copilot.auth.bootstrap-password=",
        "copilot.limits.daily-answers=2", "copilot.limits.daily-knowledge-queries=3"})
class BackendIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.11");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired TestRestTemplate http;
    @Autowired UserMapper users;
    @Autowired UsageService usage;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    private long alice;
    private long bob;

    @BeforeEach
    void resetDatabase() {
        jdbc.execute("TRUNCATE auth_tokens, usage_daily, usage_events, app_users RESTART IDENTITY CASCADE");
        alice = createUser("alice");
        bob = createUser("bob");
    }

    @Test
    void authentication_tokenIsHashedAndLogoutRevokesAccess() {
        String token = login("alice");
        var platform = http.exchange("/api/v1/platform", HttpMethod.GET, authorized(token), JsonNode.class);
        assertThat(platform.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(platform.getBody().at("/user/id").asText()).isEqualTo(Long.toString(alice));
        assertThat(platform.getBody().at("/capabilities/llm").asBoolean()).isFalse();
        assertThat(platform.getBody().toString()).doesNotContain("apiKey", "password", "token_hash");
        assertThat(jdbc.queryForObject("SELECT token_hash FROM auth_tokens", String.class)).hasSize(64).isNotEqualTo(token);

        var logout = http.exchange("/api/v1/auth/logout", HttpMethod.POST, authorized(token), Void.class);

        assertThat(logout.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(http.exchange("/api/v1/platform", HttpMethod.GET, authorized(token), String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void authentication_missingOrExpiredToken_isRejectedWhileHealthIsPublic() {
        assertThat(http.getForEntity("/actuator/health", String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(http.getForEntity("/api/v1/platform", String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        String token = login("alice");
        jdbc.update("UPDATE auth_tokens SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");

        assertThat(http.exchange("/api/v1/platform", HttpMethod.GET, authorized(token), String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void login_wrongPassword_returnsSafeError() {
        var response = http.postForEntity("/api/v1/auth/login", Map.of("username", "alice", "password", "incorrect"), JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().get("code").asText()).isEqualTo("invalid_credentials");
        assertThat(response.getBody().toString()).doesNotContain("SELECT", "password_hash", "jdbc:");
    }

    @Test
    void usage_concurrentStarts_cannotExceedDailyLimit() throws Exception {
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
            assertThat(successful).isEqualTo(2);
        }
        assertThat(jdbc.queryForObject("SELECT used_count FROM usage_daily WHERE app_users_id = ?", Integer.class, alice)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(id) FROM usage_events WHERE status = 'complete'", Integer.class)).isEqualTo(2);
    }

    @Test
    void usage_duplicateRequest_doesNotReserveTwiceAndOtherUserIsIndependent() {
        usage.start(alice, "same-request", "llm").complete();

        assertThatThrownBy(() -> usage.start(alice, "same-request", "llm"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("duplicate_request");
        usage.start(bob, "same-request", "llm").fail();

        assertThat(jdbc.queryForList("SELECT used_count FROM usage_daily ORDER BY app_users_id", Integer.class)).containsExactly(1, 1);
        assertThat(jdbc.queryForList("SELECT status FROM usage_events ORDER BY app_users_id", String.class)).containsExactly("complete", "failed");
    }

    @Test
    void usage_asrReservation_isPerUserAndCancellationReleasesIt() {
        UsageLease first = usage.start(alice, "asr-1", "asr");
        usage.start(bob, "asr-1", "asr").complete();
        assertThatThrownBy(() -> usage.start(alice, "asr-2", "asr"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("quota_exceeded");

        first.cancel();
        usage.start(alice, "asr-2", "asr").complete();

        assertThat(jdbc.queryForList("SELECT status FROM usage_events WHERE app_users_id = ? ORDER BY id", String.class, alice))
                .containsExactly("cancelled", "complete");
    }

    @Test
    void usage_expiredReservation_doesNotPermanentlyLockAccount() {
        usage.start(alice, "old-asr", "asr");
        jdbc.update("UPDATE usage_events SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");

        usage.start(alice, "new-asr", "asr").complete();

        assertThat(jdbc.queryForList("SELECT status FROM usage_events ORDER BY id", String.class))
                .containsExactly("expired", "complete");
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

    private long createUser(String username) {
        UserEntity entity = new UserEntity();
        entity.setUsername(username);
        entity.setEnabled(true);
        entity.setPasswordHash(passwords.encode("test-only-password-2026"));
        users.insert(entity);
        return entity.getId();
    }

    private String login(String username) {
        var response = http.postForEntity("/api/v1/auth/login",
                Map.of("username", username, "password", "test-only-password-2026"), JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().get("accessToken").asText();
    }

    private HttpEntity<Void> authorized(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return new HttpEntity<>(headers);
    }
}
