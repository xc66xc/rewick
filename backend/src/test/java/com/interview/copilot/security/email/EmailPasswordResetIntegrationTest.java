package com.interview.copilot.security.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.common.email.EmailAuthTestDatabase;
import com.interview.copilot.common.email.EmailTestData;
import com.interview.copilot.common.email.RegistrationMailSender;
import com.interview.copilot.config.EmailAuthProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.mapper.email.EmailCodeMapper;

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
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

@Tag("integration")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(
        classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@org.springframework.test.context.bean.override.mockito.MockitoBean(types = com.interview.copilot.job.mockinterview.MockInterviewJob.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "copilot.auth.bootstrap-username=",
            "copilot.auth.bootstrap-password=",
            "copilot.auth.admin.bootstrap-username=",
            "copilot.auth.admin.bootstrap-password=",
            "copilot.auth.email.code-secret=" + EmailTestData.SECRET,
            "copilot.auth.email.ip-hourly-send-limit=1000",
            "copilot.auth.email.ip-registration-limit=1000"
        })
public class EmailPasswordResetIntegrationTest {
    private static final String EMAIL = "reset@example.com";
    private static final String OLD = "original-password-2026";
    private static final String NEW = "replacement-password-2026";
    @Container static final EmailAuthTestDatabase POSTGRES = new EmailAuthTestDatabase();
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired EmailCodeStore codes;
    @Autowired EmailCodeMapper codeMapper;
    @Autowired EmailAuthProperties codePolicy;
    @Autowired EmailCodeSecrets codeSecrets;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean RegistrationMailSender mail;
    private final Map<String, String> mailbox = new ConcurrentHashMap<>();

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeEach
    void prepare() {
        jdbc.execute("ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS reset_test_reject_revoke");
        jdbc.execute(
                "TRUNCATE email_verifications, auth_identities, auth_tokens, app_users RESTART"
                        + " IDENTITY CASCADE");
        mailbox.clear();
        reset(mail);
        doAnswer(
                        invocation -> {
                            mailbox.put(invocation.getArgument(2), invocation.getArgument(1));
                            return null;
                        })
                .when(mail)
                .send(anyString(), anyString(), anyString());
        long id =
                jdbc.queryForObject(
                        "INSERT INTO app_users(display_name,password_hash) VALUES(?,?) RETURNING"
                                + " id",
                        Long.class,
                        EMAIL,
                        passwords.encode(OLD));
        jdbc.update(
                "INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at)"
                        + " VALUES(?,'email',?,CURRENT_TIMESTAMP)",
                id,
                EMAIL);
    }

    @Test
    void reserve_firstRequestWithNanosecondClock_isNotRateLimitedButImmediateRetryIs() {
        Clock preciseClock =
                Clock.fixed(Instant.parse("2026-09-10T05:30:00.123456789Z"), ZoneOffset.UTC);
        EmailCodeStore preciseStore =
                new EmailCodeStore(codeMapper, codePolicy, codeSecrets, preciseClock);
        TransactionTemplate transaction = new TransactionTemplate(transactions);

        var reserved = transaction.execute(status -> preciseStore.reserve(EMAIL, "password_reset"));

        assertThat(reserved).isNotNull();
        assertThat(codeMapper.lock(EMAIL, "password_reset").nextSendAt())
                .isEqualTo(LocalDateTime.parse("2026-09-10T13:31:00.123456"));
        assertThatThrownBy(
                        () ->
                                transaction.execute(
                                        status -> preciseStore.reserve(EMAIL, "password_reset")))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> assertThat(error.code()).isEqualTo("email_rate_limited"));
    }

    @Test
    void verifyAndConsume_exactLocalExpiry_rejectsCodeWithoutConsumingIt() {
        Instant start = Instant.parse("2026-09-10T15:59:00.123456789Z");
        EmailCodeStore initial =
                new EmailCodeStore(
                        codeMapper, codePolicy, codeSecrets, Clock.fixed(start, ZoneOffset.UTC));
        TransactionTemplate transaction = new TransactionTemplate(transactions);
        var code = transaction.execute(status -> initial.reserve(EMAIL, "password_reset"));
        initial.delivered(EMAIL, "password_reset", code.nonce());
        EmailCodeStore expired =
                new EmailCodeStore(
                        codeMapper,
                        codePolicy,
                        codeSecrets,
                        Clock.fixed(
                                start.plusSeconds(codePolicy.codeTtlSeconds()), ZoneOffset.UTC));

        assertThatThrownBy(
                        () ->
                                transaction.executeWithoutResult(
                                        status ->
                                                expired.verifyAndConsume(
                                                        EMAIL, "password_reset", code.value())))
                .isInstanceOf(EmailErrors.InvalidCode.class);
        assertThat(codeMapper.lock(EMAIL, "password_reset").status()).isEqualTo("ready");
    }

    @Test
    void reset_validCode_changesPasswordAndRevokesAllSessionsOnce() {
        String first = login(OLD).getBody().path("accessToken").asText();
        String second = login(OLD).getBody().path("accessToken").asText();
        assertThat(post("/email-code", Map.of("email", EMAIL)).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
        assertThat(send(" RESET@EXAMPLE.COM ").getStatusCode()).isEqualTo(HttpStatus.OK);
        String code = mailbox.get("password_reset");
        assertThat(change(NEW, code).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(change(OLD, code).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(login(OLD).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(login(NEW).getStatusCode()).isEqualTo(HttpStatus.OK);
        for (String token : List.of(first, second)) {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            assertThat(
                            http.exchange(
                                            "/api/v1/platform",
                                            HttpMethod.GET,
                                            new HttpEntity<>(headers),
                                            JsonNode.class)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    @Test
    void reset_wrongExpiredAndLockedCode_neverChangesPassword() {
        send(EMAIL);
        String valid = mailbox.get("password_reset");
        String wrong = valid.equals("000000") ? "111111" : "000000";
        for (int attempt = 0; attempt < 5; attempt++)
            assertThat(change(NEW, wrong).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT failed_attempts FROM email_verifications", Integer.class))
                .isEqualTo(5);
        assertThat(change(NEW, valid).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        allowResend();
        send(EMAIL);
        jdbc.execute(
                "UPDATE email_verifications SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1"
                        + " second'");
        assertThat(change(NEW, mailbox.get("password_reset")).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(login(OLD).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void reset_registrationCodeCannotBeUsedForPasswordReset() {
        var code = codes.reserve(EMAIL, "register");
        codes.delivered(EMAIL, "register", code.nonce());
        assertThat(change(NEW, code.value()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM email_verifications", Integer.class))
                .isEqualTo(2);
        assertThat(change(NEW, code.value()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(change(NEW, mailbox.get("password_reset")).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT status FROM email_verifications WHERE purpose='register'",
                                String.class))
                .isEqualTo("ready");
    }

    @Test
    void send_missingEmailOrUnverifiedAccount_doesNotSendMail() {
        assertThat(send("unknown@example.com").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        jdbc.execute("UPDATE auth_identities SET identity_type='account'");
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(mailbox).isEmpty();
    }

    @Test
    void reset_invalidPasswordOrDisabledUser_doesNotConsumeCode() {
        send(EMAIL);
        String code = mailbox.get("password_reset");
        assertThat(change("short", code).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(change("中".repeat(25), code).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        jdbc.execute("UPDATE app_users SET is_enabled=FALSE");
        assertThat(change(NEW, code).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(jdbc.queryForObject("SELECT status FROM email_verifications", String.class))
                .isEqualTo("ready");
        assertThat(
                        passwords.matches(
                                OLD,
                                jdbc.queryForObject(
                                        "SELECT password_hash FROM app_users", String.class)))
                .isTrue();
    }

    @Test
    void reset_revokeFailure_rollsBackPasswordAndConsumption() {
        login(OLD);
        send(EMAIL);
        jdbc.execute(
                "ALTER TABLE auth_tokens ADD CONSTRAINT reset_test_reject_revoke CHECK (NOT"
                        + " is_revoked)");
        assertThat(change(NEW, mailbox.get("password_reset")).getStatusCode())
                .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(jdbc.queryForObject("SELECT status FROM email_verifications", String.class))
                .isEqualTo("ready");
        assertThat(
                        passwords.matches(
                                OLD,
                                jdbc.queryForObject(
                                        "SELECT password_hash FROM app_users", String.class)))
                .isTrue();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM auth_tokens WHERE NOT is_revoked",
                                Long.class))
                .isEqualTo(1L);
    }

    @Test
    void send_rateLimitsAndDeliveryFailure_keepCodesUnavailable() {
        doThrow(EmailErrors.unavailable()).when(mail).send(anyString(), anyString(), anyString());
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(jdbc.queryForObject("SELECT status FROM email_verifications", String.class))
                .isEqualTo("failed");
        for (int attempt = 1; attempt < 5; attempt++) {
            allowResend();
            send(EMAIL);
        }
        allowResend();
        assertThat(send(EMAIL).getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void reset_concurrentSubmissions_onlyOneSucceeds() throws Exception {
        send(EMAIL);
        String code = mailbox.get("password_reset");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> change(NEW, code));
            var second = executor.submit(() -> change(NEW, code));
            assertThat(List.of(first.get().getStatusCode(), second.get().getStatusCode()))
                    .containsExactlyInAnyOrder(HttpStatus.NO_CONTENT, HttpStatus.BAD_REQUEST);
        }
    }

    private ResponseEntity<JsonNode> send(String email) {
        return post("/password-reset/email-code", Map.of("email", email));
    }

    private ResponseEntity<JsonNode> change(String password, String code) {
        return post("/password-reset", Map.of("email", EMAIL, "password", password, "code", code));
    }

    private ResponseEntity<JsonNode> login(String password) {
        return post(
                "/login",
                Map.of("identifier", EMAIL, "password", password, "clientType", "desktop"));
    }

    private ResponseEntity<JsonNode> post(String path, Object body) {
        return http.postForEntity("/api/v1/auth" + path, body, JsonNode.class);
    }

    private void allowResend() {
        jdbc.execute(
                "UPDATE email_verifications SET next_send_at = CURRENT_TIMESTAMP - INTERVAL '1"
                        + " second'");
    }
}
