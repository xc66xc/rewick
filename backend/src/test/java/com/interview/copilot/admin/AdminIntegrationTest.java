package com.interview.copilot.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.usage.UsageService;
import java.io.IOException;
import java.nio.file.Path;
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
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("integration")
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "copilot.auth.bootstrap-username=", "copilot.auth.bootstrap-password=",
        "copilot.auth.admin.bootstrap-username=", "copilot.auth.admin.bootstrap-password=", "copilot.auth.login-burst=1000"})
class AdminIntegrationTest {
    private static final String PASSWORD = "test-only-password-2026";
    @Container static final PostgreSQLContainer<?> POSTGRES = new AdminPostgres();
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired UsageService usage;
    private long administrator;
    private long member;
    private String adminToken;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeEach
    void reset() {
        jdbc.execute("TRUNCATE auth_tokens, usage_daily, usage_events, audit_events, app_users RESTART IDENTITY CASCADE");
        administrator = account("administrator", "ADMIN");
        member = account("member", "USER");
        adminToken = login("administrator", PASSWORD);
    }

    @Test
    void security_ordinaryUserAndAnonymous_cannotAccessAnyAdminResource() {
        String token = login("member", PASSWORD);
        for (String resource : List.of("me", "users", "usage", "audit", "config")) {
            assertThat(call(HttpMethod.GET, "/api/v1/admin/" + resource, token, null).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(call(HttpMethod.GET, "/api/v1/admin/" + resource, null, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        assertThat(call(HttpMethod.POST, "/api/v1/admin/users", token, createBody("blocked")).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void me_authenticatedAdministrator_returnsOnlyPublicIdentity() {
        JsonNode body = call(HttpMethod.GET, "/api/v1/admin/me", adminToken, null).getBody();
        assertThat(body.path("id").isTextual()).isTrue();
        assertThat(body.path("id").asText()).isEqualTo(Long.toString(administrator));
        assertThat(body.path("role").asText()).isEqualTo("ADMIN");
        assertThat(body.toString()).doesNotContain("password", "hash", "apiKey");
    }

    @Test
    void users_createAndSearch_returnsUserRoleEffectiveLimitsAndStringIds() {
        var created = call(HttpMethod.POST, "/api/v1/admin/users", adminToken, createBody("new_member"));
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(created.getBody().path("role").asText()).isEqualTo("USER");
        assertThat(created.getBody().path("dailyAnswers").asInt()).isZero();
        assertThat(created.getBody().path("id").isTextual()).isTrue();
        JsonNode page = call(HttpMethod.GET, "/api/v1/admin/users?query=new_mem&page=1&size=1", adminToken, null).getBody();
        assertThat(page.path("total").asInt()).isEqualTo(1);
        assertThat(page.path("items").size()).isEqualTo(1);
        assertThat(page.toString()).doesNotContain("password", "hash", "apiKey");
    }

    @Test
    void users_andUsage_searchEmailWhenDisplayNameDiffers() {
        jdbc.update("UPDATE app_users SET display_name='显示名称' WHERE id=?", member);
        jdbc.update("INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at) VALUES(?,'email','lookup@example.com',CURRENT_TIMESTAMP)", member);
        jdbc.update("INSERT INTO usage_events(app_users_id,request_id,capability,expires_at) VALUES(?,'lookup-request','knowledge',CURRENT_TIMESTAMP)", member);
        var users = call(HttpMethod.GET, "/api/v1/admin/users?query=lookup", adminToken, null).getBody();
        assertThat(users.path("total").asInt()).isEqualTo(1);
        assertThat(users.path("items").get(0).path("displayName").asText()).isEqualTo("显示名称");
        var usage = call(HttpMethod.GET, "/api/v1/admin/usage?query=lookup", adminToken, null).getBody();
        assertThat(usage.path("total").asInt()).isEqualTo(1);
        assertThat(usage.path("items").get(0).path("displayName").asText()).isEqualTo("显示名称");
    }

    @Test
    void users_duplicateAndInvalidInputs_returnSafeErrorsWithoutCreation() {
        assertThat(call(HttpMethod.POST, "/api/v1/admin/users", adminToken, createBody("member")).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var invalid = Map.of("identifier", "unicode", "password", "汉".repeat(25), "dailyAnswers", 1, "dailyKnowledgeQueries", 1);
        assertThat(call(HttpMethod.POST, "/api/v1/admin/users", adminToken, invalid).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(call(HttpMethod.GET, "/api/v1/admin/users?page=0", adminToken, null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(call(HttpMethod.PUT, "/api/v1/admin/users/9223372036854775808", adminToken, updateBody(true, 1)).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Integer.class)).isEqualTo(2);
    }

    @Test
    void users_disabledThenEnabled_oldTokensRemainRevoked() {
        String token = login("member", PASSWORD);
        assertThat(call(HttpMethod.PUT, userPath(member), adminToken, updateBody(false, 2)).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(call(HttpMethod.GET, "/api/v1/platform", token, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        call(HttpMethod.PUT, userPath(member), adminToken, updateBody(true, 2));
        assertThat(call(HttpMethod.GET, "/api/v1/platform", token, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(login("member", PASSWORD)).isNotBlank();
    }

    @Test
    void password_reset_revokesAllTokensAndAuditsWithoutPassword() {
        String first = login("member", PASSWORD);
        String second = login("member", PASSWORD);
        String replacement = "replacement-only-password";
        assertThat(call(HttpMethod.POST, userPath(member) + "/password", adminToken, Map.of("password", replacement)).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        for (String token : List.of(first, second)) {
            assertThat(call(HttpMethod.GET, "/api/v1/platform", token, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        assertThat(call(HttpMethod.POST, "/api/v1/auth/login", null, Map.of("identifier", "member", "password", PASSWORD)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(login("member", replacement)).isNotBlank();
        String audit = call(HttpMethod.GET, "/api/v1/admin/audit", adminToken, null).getBody().toString();
        assertThat(audit).contains("user.password_reset", "administrator").doesNotContain(replacement, PASSWORD, "passwordHash", "token_hash");
    }

    @Test
    void tokens_revokeAll_doesNotDisableAccountOrChangePassword() {
        String token = login("member", PASSWORD);
        assertThat(call(HttpMethod.POST, userPath(member) + "/revoke-tokens", adminToken, Map.of()).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(call(HttpMethod.GET, "/api/v1/platform", token, null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(login("member", PASSWORD)).isNotBlank();
    }

    @Test
    void users_cannotDisableSelfAndConcurrentAdminsCannotDisableEachOther() throws Exception {
        assertThat(call(HttpMethod.PUT, userPath(administrator), adminToken, updateBody(false, 1)).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        long other = account("other_admin", "ADMIN");
        String otherToken = login("other_admin", PASSWORD);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> { start.await(); return call(HttpMethod.PUT, userPath(other), adminToken, updateBody(false, 1)).getStatusCode().value(); });
            var second = executor.submit(() -> { start.await(); return call(HttpMethod.PUT, userPath(administrator), otherToken, updateBody(false, 1)).getStatusCode().value(); });
            start.countDown();
            assertThat(List.of(first.get(), second.get())).contains(200).anyMatch(code -> code == 401 || code == 403);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users WHERE role = 'ADMIN' AND is_enabled", Integer.class)).isEqualTo(1);
    }

    @Test
    void limits_zeroAndUpdatedOverrides_takeEffectForPlatformAndNextRequest() {
        String memberToken = login("member", PASSWORD);
        call(HttpMethod.PUT, userPath(member), adminToken, updateBody(true, 0));
        assertThat(call(HttpMethod.GET, "/api/v1/platform", memberToken, null).getBody().at("/limits/dailyAnswers").asInt()).isZero();
        assertThatThrownBy(() -> usage.start(member, "denied", "llm")).isInstanceOf(ApiException.class).extracting("code").isEqualTo("quota_exceeded");
        call(HttpMethod.PUT, userPath(member), adminToken, updateBody(true, 1));
        usage.start(member, "accepted", "llm").complete();
        assertThatThrownBy(() -> usage.start(member, "denied-again", "llm")).isInstanceOf(ApiException.class);
    }

    @Test
    void limits_concurrentRequests_cannotExceedUserOverride() throws Exception {
        call(HttpMethod.PUT, userPath(member), adminToken, updateBody(true, 2));
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Boolean>> calls = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            String request = "parallel-" + index;
            calls.add(() -> { start.await(); return reserve(request); });
        }
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = calls.stream().map(executor::submit).toList();
            start.countDown();
            int accepted = 0;
            for (var future : futures) if (future.get()) accepted++;
            assertThat(accepted).isEqualTo(2);
        }
    }

    @Test
    void usage_filtersAndModelUpdates_areScopedToUserAndContainNoContent() {
        var lease = usage.start(member, "record", "llm");
        usage.describeModel(administrator, "record", "llm", "wrong-owner");
        usage.describeModel(member, "record", "llm", "provider-model");
        lease.complete();
        usage.start(administrator, "another", "knowledge").fail();
        JsonNode page = call(HttpMethod.GET, "/api/v1/admin/usage?userId=" + member + "&capability=llm&status=complete&model=provider-model", adminToken, null).getBody();
        assertThat(page.path("total").asInt()).isEqualTo(1);
        assertThat(page.at("/items/0/userId").asText()).isEqualTo(Long.toString(member));
        assertThat(page.at("/items/0/finishedAt").isNull()).isFalse();
        assertThat(page.toString()).doesNotContain("wrong-owner", "password", "apiKey", "messages", "prompt");
    }

    @Test
    void audit_failedInsert_rollsBackUserCreation() {
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT reject_create CHECK (action <> 'user.create')");
        try {
            assertThat(call(HttpMethod.POST, "/api/v1/admin/users", adminToken, createBody("rollback_user")).getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users WHERE display_name = 'rollback_user'", Integer.class)).isZero();
        } finally {
            jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT reject_create");
        }
    }

    private boolean reserve(String request) {
        try (var lease = usage.start(member, request, "llm")) { lease.complete(); return true; }
        catch (ApiException error) { assertThat(error.code()).isEqualTo("quota_exceeded"); return false; }
    }

    private long account(String displayName, String role) {
        long id = jdbc.queryForObject("INSERT INTO app_users(display_name, password_hash, role) VALUES(?, ?, ?) RETURNING id",
                Long.class, displayName, passwords.encode(PASSWORD), role);
        jdbc.update("INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at) VALUES(?,'account',?,CURRENT_TIMESTAMP)", id, displayName);
        return id;
    }

    private String login(String displayName, String password) {
        var response = call(HttpMethod.POST, "/api/v1/auth/login", null, Map.of("identifier", displayName, "password", password));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().path("accessToken").asText();
    }

    private ResponseEntity<JsonNode> call(HttpMethod method, String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) headers.setBearerAuth(token);
        return http.exchange(path, method, new HttpEntity<>(body, headers), JsonNode.class);
    }

    private String userPath(long id) { return "/api/v1/admin/users/" + id; }
    private Map<String, Object> createBody(String displayName) { return Map.of("identifier", displayName, "password", PASSWORD, "dailyAnswers", 0, "dailyKnowledgeQueries", 3); }
    private Map<String, Object> updateBody(boolean enabled, int answers) { return Map.of("enabled", enabled, "dailyAnswers", answers, "dailyKnowledgeQueries", 3); }

    @TestConfiguration
    static class FastPasswords {
        @Bean @Primary PasswordEncoder testPasswords() { return new BCryptPasswordEncoder(4); }
    }

    private static final class AdminPostgres extends PostgreSQLContainer<AdminPostgres> {
        private AdminPostgres() {
            super(DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.5.1").asCompatibleSubstituteFor("postgres"));
            for (String name : List.of("01_schema.sql", "02_pgvector.sql", "03_admin_users.sql", "04_platform_config.sql", "05_email_auth.sql", "06_display_name.sql")) {
                withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql", name)), "/tmp/" + name);
            }
        }

        @Override
        protected void containerIsStarted(InspectContainerResponse info) {
            super.containerIsStarted(info);
            try {
                var result = execInContainer("psql", "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-U", getUsername(), "-d", getDatabaseName(),
                        "-f", "/tmp/01_schema.sql", "-f", "/tmp/02_pgvector.sql", "-f", "/tmp/03_admin_users.sql", "-f", "/tmp/04_platform_config.sql", "-f", "/tmp/05_email_auth.sql", "-f", "/tmp/06_display_name.sql");
                if (result.getExitCode() != 0) throw new IllegalStateException("Admin test SQL initialization failed");
            } catch (IOException error) {
                throw new IllegalStateException("Admin test SQL execution failed", error);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Admin test SQL execution interrupted", error);
            }
        }
    }
}
