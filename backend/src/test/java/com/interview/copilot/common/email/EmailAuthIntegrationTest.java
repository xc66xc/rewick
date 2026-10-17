package com.interview.copilot.common.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.email.EmailErrors;

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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

@Tag("integration")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(
        classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@org.springframework.test.context.bean.override.mockito.MockitoBean(types = com.interview.copilot.job.mockinterview.MockInterviewJob.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "copilot.auth.bootstrap-username=", "copilot.auth.bootstrap-password=",
            "copilot.auth.admin.bootstrap-username=", "copilot.auth.admin.bootstrap-password=",
            "copilot.auth.email.enabled=true",
                    "copilot.auth.email.code-secret=" + EmailTestData.SECRET,
            "copilot.auth.email.ip-hourly-send-limit=1000",
                    "copilot.auth.email.ip-registration-limit=1000"
        })
public class EmailAuthIntegrationTest {
    private static final String EMAIL = "alice@example.com";
    private static final String PASSWORD = "test-email-password-2026";
    @Container static final EmailAuthTestDatabase POSTGRES = new EmailAuthTestDatabase();
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @MockitoBean RegistrationMailSender mail;
    private final Map<String, String> mailbox = new ConcurrentHashMap<>();

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeEach
    void resetDatabase() {
        jdbc.execute("ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS email_test_reject_token");
        jdbc.execute(
                "TRUNCATE email_verifications, auth_identities, auth_tokens, usage_events,"
                        + " audit_events, app_users RESTART IDENTITY CASCADE");
        jdbc.update("UPDATE invitation_settings SET is_enabled=false,reward_seconds=0,version=0");
        mailbox.clear();
        reset(mail);
        doAnswer(
                        invocation -> {
                            mailbox.put(invocation.getArgument(0), invocation.getArgument(1));
                            return null;
                        })
                .when(mail)
                .send(anyString(), anyString(), anyString());
    }

    @Test
    void register_validCode_normalizesEmailAndReturnsUsableUserTokenWithoutSecrets() {
        ResponseEntity<JsonNode> sent = send(" ALICE@Example.COM ");
        assertThat(sent.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(sent.getBody().size()).isEqualTo(2);
        assertThat(sent.getBody().path("retryAfterSeconds").asInt()).isEqualTo(60);
        assertThat(sent.getBody().path("expiresInSeconds").asInt()).isEqualTo(600);
        String code = mailbox.get(EMAIL);
        assertThat(jdbc.queryForObject("SELECT code_digest FROM email_verifications", String.class))
                .hasSize(64)
                .isNotEqualTo(code);
        var registered = register("ALICE@example.com", PASSWORD, code);
        assertThat(registered.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode body = registered.getBody();
        assertThat(body.path("user").path("email").asText()).isEqualTo(EMAIL);
        assertThat(body.path("user").path("displayName").asText()).isEqualTo(EMAIL);
        assertThat(body.path("user").has("username")).isFalse();
        assertThat(body.path("user").path("role").asText()).isEqualTo("USER");
        assertThat(body.path("user").path("id").isTextual()).isTrue();
        assertThat(body.toString()).doesNotContain("passwordHash", "codeDigest", code);
        String token = body.path("accessToken").asText();
        assertThat(
                        call(HttpMethod.GET, "/api/v1/platform", token, null)
                                .getBody()
                                .path("user")
                                .path("email")
                                .asText())
                .isEqualTo(EMAIL);
        var relogin = login(" ALICE@EXAMPLE.COM ", PASSWORD);
        assertThat(relogin.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(call(HttpMethod.GET, "/api/v1/platform", token, null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        token = relogin.getBody().path("accessToken").asText();
        assertThat(jdbc.queryForObject("SELECT code_digest FROM email_verifications", String.class))
                .isEmpty();
        assertThat(call(HttpMethod.POST, "/api/v1/auth/logout", token, null).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(call(HttpMethod.GET, "/api/v1/platform", token, null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void register_wrongCode_attemptsPersistAndLockEvenTheCorrectCode() {
        send(EMAIL);
        String valid = mailbox.get(EMAIL);
        String wrong = valid.equals("000000") ? "111111" : "000000";
        for (int attempt = 0; attempt < 5; attempt++)
            assertThat(register(EMAIL, PASSWORD, wrong).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT failed_attempts FROM email_verifications", Integer.class))
                .isEqualTo(5);
        assertThat(register(EMAIL, PASSWORD, valid).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(count("app_users")).isZero();
    }

    @Test
    void register_expiredCode_rejectsAndResendReplacesTheDigest() {
        send(EMAIL);
        String oldDigest =
                jdbc.queryForObject("SELECT code_digest FROM email_verifications", String.class);
        jdbc.execute(
                "UPDATE email_verifications SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1"
                        + " second'");
        assertThat(register(EMAIL, PASSWORD, mailbox.get(EMAIL)).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        allowResend();
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("SELECT code_digest FROM email_verifications", String.class))
                .isNotEqualTo(oldDigest);
        assertThat(register(EMAIL, PASSWORD, mailbox.get(EMAIL)).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void send_resendAndHourlyBudgets_persistInDatabase() {
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(send("ALICE@example.com").getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        for (int attempt = 1; attempt < 5; attempt++) {
            allowResend();
            assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.OK);
        }
        allowResend();
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(jdbc.queryForObject("SELECT send_count FROM email_verifications", Integer.class))
                .isEqualTo(5);
    }

    @Test
    void send_concurrentRequests_onlyOneReservationDeliversMail() throws Exception {
        List<HttpStatus> statuses = concurrent(() -> send(EMAIL));
        assertThat(statuses.stream().filter(HttpStatus.OK::equals).count()).isEqualTo(1);
        assertThat(statuses.stream().filter(HttpStatus.TOO_MANY_REQUESTS::equals).count())
                .isEqualTo(11);
        assertThat(jdbc.queryForObject("SELECT send_count FROM email_verifications", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void register_concurrentRequests_consumesCodeAndCreatesExactlyOneIdentityAndToken()
            throws Exception {
        send(EMAIL);
        String code = mailbox.get(EMAIL);
        List<HttpStatus> statuses = concurrent(() -> register(EMAIL, PASSWORD, code));
        assertThat(statuses.stream().filter(HttpStatus.CREATED::equals).count()).isEqualTo(1);
        assertThat(statuses.stream().filter(HttpStatus.BAD_REQUEST::equals).count()).isEqualTo(11);
        assertThat(count("app_users")).isEqualTo(1);
        assertThat(count("auth_identities")).isEqualTo(1);
        assertThat(count("auth_tokens")).isEqualTo(1);
    }

    @Test
    void send_mailFailure_returnsSafe503AndNeverActivatesTheCode() {
        doThrow(EmailErrors.unavailable()).when(mail).send(anyString(), anyString(), anyString());
        var result = send(EMAIL);
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(result.getBody().path("code").asText()).isEqualTo("email_unavailable");
        assertThat(jdbc.queryForObject("SELECT status FROM email_verifications", String.class))
                .isEqualTo("failed");
        assertThat(register(EMAIL, PASSWORD, "123456").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void send_registeredAddress_returnsConflictAndDoesNotResetTheAccount() {
        send(EMAIL);
        register(EMAIL, PASSWORD, mailbox.get(EMAIL));
        mailbox.clear();
        doThrow(EmailErrors.unavailable()).when(mail).requireConfigured();
        var repeated = send(EMAIL);
        assertThat(repeated.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(repeated.getBody().path("message").asText())
                .isEqualTo("该邮箱已注册，如果该邮箱为您的邮箱，可以直接登录或找回密码");
        assertThat(mailbox).isEmpty();
        assertThat(login(EMAIL, PASSWORD).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(count("app_users")).isEqualTo(1);
    }

    @Test
    void registration_missingConfiguration_returns503ForBothPublicEndpoints() {
        doThrow(EmailErrors.unavailable()).when(mail).requireConfigured();
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(register(EMAIL, PASSWORD, "123456").getStatusCode())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(count("email_verifications")).isZero();
    }

    @Test
    void register_tokenStorageFailure_rollsBackUserIdentityAndCodeConsumption() {
        send(EMAIL);
        String code = mailbox.get(EMAIL);
        jdbc.execute(
                "ALTER TABLE auth_tokens ADD CONSTRAINT email_test_reject_token CHECK (FALSE)");
        assertThat(register(EMAIL, PASSWORD, code).getStatusCode())
                .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(count("app_users")).isZero();
        assertThat(count("auth_identities")).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM email_verifications", String.class))
                .isEqualTo("ready");
        jdbc.execute("ALTER TABLE auth_tokens DROP CONSTRAINT email_test_reject_token");
        assertThat(register(EMAIL, PASSWORD, code).getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void login_existingEmailShapedAccountIdentity_remainsUnboundAndCannotBeRegistered() {
        long id =
                jdbc.queryForObject(
                        "INSERT INTO app_users(display_name,password_hash,role) VALUES(?,?,'ADMIN')"
                                + " RETURNING id",
                        Long.class,
                        EMAIL,
                        passwords.encode(PASSWORD));
        jdbc.update(
                "INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at)"
                        + " VALUES(?,'account',?,CURRENT_TIMESTAMP)",
                id,
                EMAIL);
        assertThat(login(EMAIL, PASSWORD).getBody().path("user").path("role").asText())
                .isEqualTo("ADMIN");
        assertThat(login(EMAIL, PASSWORD).getBody().path("user").has("email")).isFalse();
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(mailbox).isEmpty();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT COUNT(*) FROM auth_identities WHERE identity_type='email'",
                                Integer.class))
                .isZero();
    }

    @Test
    void register_invalidEmailPasswordOrUnexpectedRole_neverCreatesAnAccount() {
        assertThat(send("a@example.com\r\nBcc:other@example.com").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        send(EMAIL);
        String code = mailbox.get(EMAIL);
        assertThat(register(EMAIL, "too-short", code).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(register(EMAIL, "中".repeat(25), code).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        var injected = Map.of("email", EMAIL, "password", PASSWORD, "code", code, "role", "ADMIN");
        assertThat(call(HttpMethod.POST, "/api/v1/auth/register", null, injected).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(count("app_users")).isZero();
    }

    @Test
    void invitation_registerCreditsInviterOnceAndPreservesVerifiedRegistration() {
        String invitation = prepareInvitation();
        send("friend@example.com");
        var result = invitedRegistration("friend@example.com", invitation.toLowerCase());
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT available_seconds FROM time_wallets WHERE app_users_id=1",
                                Long.class))
                .isEqualTo(600);
        assertThat(count("user_invitations")).isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT delta_seconds FROM time_wallet_transactions WHERE"
                                    + " operation='invitation_reward'",
                                Long.class))
                .isEqualTo(600);
        assertThat(
                        invitedRegistration("friend@example.com", invitation)
                                .getStatusCode()
                                .is4xxClientError())
                .isTrue();
        assertThat(count("user_invitations")).isEqualTo(1);
    }

    @Test
    void invitation_invalidOrDisabledCodeRollsBackAccountAndAllowsCorrectedRetry() {
        String invitation = prepareInvitation();
        send("friend@example.com");
        assertThat(invitedRegistration("friend@example.com", "AAAAAA").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(count("app_users")).isEqualTo(1);
        jdbc.update("UPDATE invitation_settings SET is_enabled=false");
        assertThat(invitedRegistration("friend@example.com", invitation).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
        assertThat(count("user_invitations")).isZero();
        jdbc.update("UPDATE invitation_settings SET is_enabled=true");
        assertThat(invitedRegistration("friend@example.com", invitation).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void invitation_tokenFailureRollsBackRewardAndCodeConsumption() {
        String invitation = prepareInvitation();
        send("friend@example.com");
        jdbc.execute(
                "ALTER TABLE auth_tokens ADD CONSTRAINT email_test_reject_token CHECK"
                    + " (app_users_id=1)");
        assertThat(
                        invitedRegistration("friend@example.com", invitation)
                                .getStatusCode()
                                .is5xxServerError())
                .isTrue();
        assertThat(count("app_users")).isEqualTo(1);
        assertThat(count("user_invitations")).isZero();
        assertThat(count("time_wallet_transactions")).isZero();
        jdbc.execute("ALTER TABLE auth_tokens DROP CONSTRAINT email_test_reject_token");
        assertThat(invitedRegistration("friend@example.com", invitation).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void invitation_concurrentNewUsersAccumulateAllRewards() throws Exception {
        String invitation = prepareInvitation();
        send("first@example.com");
        send("second@example.com");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> invitedRegistration("first@example.com", invitation));
            var second =
                    executor.submit(() -> invitedRegistration("second@example.com", invitation));
            assertThat(first.get().getStatusCode()).isEqualTo(HttpStatus.CREATED);
            assertThat(second.get().getStatusCode()).isEqualTo(HttpStatus.CREATED);
        }
        assertThat(
                        jdbc.queryForObject(
                                "SELECT available_seconds FROM time_wallets WHERE app_users_id=1",
                                Long.class))
                .isEqualTo(1200);
        assertThat(count("user_invitations")).isEqualTo(2);
    }

    @Test
    void invitation_adminRulesAreVersionedAndRecordsShowEmails() {
        String invitation = prepareInvitation();
        send("friend@example.com");
        var friend = invitedRegistration("friend@example.com", invitation);
        String userToken = friend.getBody().path("accessToken").asText();
        assertThat(call(HttpMethod.GET, "/api/v1/invitations/me", null, null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(
                        call(HttpMethod.GET, "/api/v1/admin/invitations", userToken, null)
                                .getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        jdbc.update("UPDATE app_users SET role='ADMIN' WHERE display_name='friend@example.com'");
        var admin =
                call(
                        HttpMethod.POST,
                        "/api/v1/auth/login",
                        null,
                        Map.of(
                                "identifier",
                                "friend@example.com",
                                "password",
                                PASSWORD,
                                "clientType",
                                "admin"));
        String token = admin.getBody().path("accessToken").asText();
        var input = Map.of("enabled", true, "rewardSeconds", 1200, "version", 0);
        assertThat(
                        call(HttpMethod.PUT, "/api/v1/admin/invitation-settings", token, input)
                                .getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(
                        call(HttpMethod.PUT, "/api/v1/admin/invitation-settings", token, input)
                                .getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
        var records =
                call(
                        HttpMethod.GET,
                        "/api/v1/admin/invitations?search=friend@example.com",
                        token,
                        null);
        assertThat(records.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(records.getBody().path("total").asInt()).isEqualTo(1);
        assertThat(records.getBody().path("items").get(0).path("inviterEmail").asText())
                .isEqualTo(EMAIL);
        assertThat(records.getBody().path("items").get(0).path("rewardSeconds").asLong())
                .isEqualTo(600);
    }

    @Test
    void invitation_creditSettlesExpiredInterviewBeforeAddingNewTime() {
        String invitation = prepareInvitation();
        jdbc.update("INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(1,100)");
        jdbc.update(
                "INSERT INTO"
                    + " interview_sessions(session_id,app_users_id,request_id,started_at,expires_at)"
                    + " VALUES('test-expired',1,'test-request',(clock_timestamp() AT TIME ZONE"
                    + " 'Asia/Shanghai')-interval '120 seconds',(clock_timestamp() AT TIME ZONE"
                    + " 'Asia/Shanghai')-interval '90 seconds')");
        send("friend@example.com");
        assertThat(invitedRegistration("friend@example.com", invitation).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT available_seconds FROM time_wallets WHERE app_users_id=1",
                                Long.class))
                .isEqualTo(670);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT status FROM interview_sessions WHERE app_users_id=1",
                                String.class))
                .isEqualTo("ended");
    }

    private String prepareInvitation() {
        send(EMAIL);
        var registered = register(EMAIL, PASSWORD, mailbox.get(EMAIL));
        assertThat(registered.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String token = registered.getBody().path("accessToken").asText();
        jdbc.update("UPDATE invitation_settings SET is_enabled=true,reward_seconds=600");
        var created = call(HttpMethod.POST, "/api/v1/invitations/me/code", token, null);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        String code = created.getBody().path("code").asText();
        assertThat(code).matches("[A-Z2-9]{6}");
        assertThat(
                        call(HttpMethod.POST, "/api/v1/invitations/me/code", token, null)
                                .getBody()
                                .path("code")
                                .asText())
                .isEqualTo(code);
        return code;
    }

    private ResponseEntity<JsonNode> invitedRegistration(String email, String invitation) {
        return call(
                HttpMethod.POST,
                "/api/v1/auth/register",
                null,
                Map.of(
                        "email",
                        email,
                        "password",
                        PASSWORD,
                        "code",
                        mailbox.get(email),
                        "invitationCode",
                        invitation));
    }

    private ResponseEntity<JsonNode> send(String email) {
        return call(HttpMethod.POST, "/api/v1/auth/email-code", null, Map.of("email", email));
    }

    private ResponseEntity<JsonNode> register(String email, String password, String code) {
        return call(
                HttpMethod.POST,
                "/api/v1/auth/register",
                null,
                Map.of("email", email, "password", password, "code", code));
    }

    private ResponseEntity<JsonNode> login(String displayName, String password) {
        return call(
                HttpMethod.POST,
                "/api/v1/auth/login",
                null,
                Map.of("identifier", displayName, "password", password, "clientType", "desktop"));
    }

    private ResponseEntity<JsonNode> call(
            HttpMethod method, String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) headers.setBearerAuth(token);
        return http.exchange(path, method, new HttpEntity<>(body, headers), JsonNode.class);
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private void allowResend() {
        jdbc.execute(
                "UPDATE email_verifications SET next_send_at = CURRENT_TIMESTAMP - INTERVAL '1"
                        + " second'");
    }

    private List<HttpStatus> concurrent(Callable<ResponseEntity<JsonNode>> action)
            throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<HttpStatus>> tasks = new ArrayList<>();
        for (int index = 0; index < 12; index++)
            tasks.add(
                    () -> {
                        start.await();
                        return HttpStatus.valueOf(action.call().getStatusCode().value());
                    });
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = tasks.stream().map(executor::submit).toList();
            start.countDown();
            List<HttpStatus> statuses = new ArrayList<>();
            for (var future : futures) statuses.add(future.get());
            return statuses;
        }
    }

    @TestConfiguration
    static class FasterPasswords {
        @Bean
        @Primary
        PasswordEncoder testPasswords() {
            return new BCryptPasswordEncoder(4);
        }
    }
}
