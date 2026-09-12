package com.interview.copilot.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.common.email.EmailAuthTestDatabase;
import com.interview.copilot.common.email.EmailTestData;
import com.interview.copilot.common.email.SmtpTransport;
import com.interview.copilot.dto.email.EmailConfiguration;
import com.interview.copilot.mapper.email.EmailConfigurationMapper;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.impl.email.EmailConfigurationServiceImpl;

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
        properties = {
            "copilot.auth.bootstrap-username=",
            "copilot.auth.bootstrap-password=",
            "copilot.auth.admin.bootstrap-username=",
            "copilot.auth.admin.bootstrap-password=",
            "copilot.platform.master-key=" + EmailTestData.SECRET,
            "copilot.auth.login-burst=1000"
        })
public class EmailConfigurationIntegrationTest {
    private static final String PASSWORD = "test-admin-password-2026";
    private static final String SMTP_PASSWORD = "isolated-smtp-secret-2026";
    private static final String PATH = "/api/v1/admin/email-config";
    @Container static final EmailAuthTestDatabase POSTGRES = new EmailAuthTestDatabase();
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired EmailConfigurationMapper mapper;
    @Autowired AuditService audit;
    @MockitoBean SmtpTransport smtp;
    private String admin;
    private String member;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeEach
    void resetDatabase() {
        jdbc.execute(
                "TRUNCATE email_verifications, auth_identities, auth_tokens, usage_events,"
                        + " audit_events, app_users RESTART IDENTITY CASCADE");
        jdbc.execute(
                "UPDATE email_config SET version=0, is_enabled=FALSE, host='', port=587,"
                        + " username='', encrypted_password='', from_address='', is_start_tls=TRUE,"
                        + " is_ssl=FALSE");
        admin = account("administrator", "ADMIN");
        member = account("member", "USER");
    }

    @Test
    void configuration_onlyAdministratorsCanReadPublishAndTest() {
        for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.PUT, HttpMethod.POST)) {
            String path = method.equals(HttpMethod.POST) ? PATH + "/test" : PATH;
            assertThat(
                            call(
                                            method,
                                            path,
                                            member,
                                            config(0, "smtp.example.com", "user", SMTP_PASSWORD))
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(
                            call(
                                            method,
                                            path,
                                            null,
                                            config(0, "smtp.example.com", "user", SMTP_PASSWORD))
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        JsonNode view = call(HttpMethod.GET, PATH, admin, null).getBody();
        assertThat(view.path("version").asLong()).isZero();
        assertThat(view.path("enabled").asBoolean()).isFalse();
        assertThat(view.has("password")).isFalse();
    }

    @Test
    void publish_passwordEncryptedAndFreshResolverReadsIt_withoutPublicSecretFields() {
        var result =
                call(
                        HttpMethod.PUT,
                        PATH,
                        admin,
                        config(0, "smtp.example.com", "user", SMTP_PASSWORD));
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(result.getBody().path("hasPassword").asBoolean()).isTrue();
        assertThat(result.getBody().has("password")).isFalse();
        String encrypted =
                jdbc.queryForObject("SELECT encrypted_password FROM email_config", String.class);
        assertThat(encrypted).startsWith("v1:").doesNotContain(SMTP_PASSWORD);
        var rebuilt =
                new EmailConfigurationServiceImpl(
                        mapper, new PlatformSecretCipher(EmailTestData.SECRET), audit);
        assertThat(rebuilt.snapshot().smtp().password()).isEqualTo(SMTP_PASSWORD);
        assertThat(call(HttpMethod.GET, "/api/v1/platform", member, null).getBody().toString())
                .doesNotContain(SMTP_PASSWORD, "smtp.example.com", "hasPassword");
        assertThat(jdbc.queryForList("SELECT target FROM audit_events", String.class))
                .containsExactly("version:1");
    }

    @Test
    void publish_retainedPasswordCannotFollowChangedEndpoint_andBlankUsernameClearsIt() {
        call(HttpMethod.PUT, PATH, admin, config(0, "smtp.example.com", "user", SMTP_PASSWORD));
        assertThat(
                        call(HttpMethod.PUT, PATH, admin, config(1, "smtp.example.com", "user", ""))
                                .getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(
                        call(
                                        HttpMethod.PUT,
                                        PATH,
                                        admin,
                                        config(2, "other.example.com", "user", ""))
                                .getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(jdbc.queryForObject("SELECT version FROM email_config", Long.class))
                .isEqualTo(2);
        var cleared = call(HttpMethod.PUT, PATH, admin, config(2, "other.example.com", "", ""));
        assertThat(cleared.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(cleared.getBody().path("hasPassword").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("SELECT encrypted_password FROM email_config", String.class))
                .isEmpty();
    }

    @Test
    void publish_maximumMultibytePassword_fitsEncryptedStorageAndCanBeReadAfterRestart() {
        String password = "密".repeat(4096);
        var result =
                call(HttpMethod.PUT, PATH, admin, config(0, "smtp.example.com", "user", password));
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.OK);
        var rebuilt =
                new EmailConfigurationServiceImpl(
                        mapper, new PlatformSecretCipher(EmailTestData.SECRET), audit);
        assertThat(rebuilt.snapshot().smtp().password()).isEqualTo(password);
        assertThat(result.getBody().has("password")).isFalse();
    }

    @Test
    void publish_sameVersionConcurrently_commitsOnlyOneConfigAndOneAudit() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        Callable<HttpStatus> task =
                () -> {
                    start.await();
                    return HttpStatus.valueOf(
                            call(
                                            HttpMethod.PUT,
                                            PATH,
                                            admin,
                                            config(0, "smtp.example.com", "user", SMTP_PASSWORD))
                                    .getStatusCode()
                                    .value());
                };
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(task);
            var second = executor.submit(task);
            start.countDown();
            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(HttpStatus.OK, HttpStatus.CONFLICT);
        }
        assertThat(jdbc.queryForObject("SELECT version FROM email_config", Long.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void testConnection_draftDoesNotPublishOrSendMail_andAcceptsAnonymousLoopback() {
        var draft =
                new EmailConfiguration(
                        0,
                        true,
                        "127.0.0.1",
                        2525,
                        "",
                        false,
                        "",
                        "sender@example.com",
                        false,
                        false);
        var tested = call(HttpMethod.POST, PATH + "/test", admin, Map.of("config", draft));
        assertThat(tested.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(tested.getBody().path("success").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT version FROM email_config", Long.class)).isZero();
        verify(smtp, never()).send(any(), any(), any(), anyInt(), any());
        assertThat(call(HttpMethod.PUT, PATH, admin, draft).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    private EmailConfiguration config(long version, String host, String username, String password) {
        return new EmailConfiguration(
                version,
                true,
                host,
                587,
                username,
                false,
                password,
                "mail@example.com",
                true,
                false);
    }

    private String account(String username, String role) {
        long id =
                jdbc.queryForObject(
                        "INSERT INTO app_users(display_name,password_hash,role) VALUES(?,?,?)"
                                + " RETURNING id",
                        Long.class,
                        username,
                        passwords.encode(PASSWORD),
                        role);
        jdbc.update(
                "INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at)"
                        + " VALUES(?,'account',?,CURRENT_TIMESTAMP)",
                id,
                username);
        return call(
                        HttpMethod.POST,
                        "/api/v1/auth/login",
                        null,
                        Map.of("identifier", username, "password", PASSWORD))
                .getBody()
                .path("accessToken")
                .asText();
    }

    private ResponseEntity<JsonNode> call(
            HttpMethod method, String path, String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) headers.setBearerAuth(token);
        Object payload = body;
        if (body instanceof EmailConfiguration config) payload = request(config);
        if (body instanceof Map<?, ?> wrapped
                && wrapped.get("config") instanceof EmailConfiguration config)
            payload = Map.of("config", request(config));
        return http.exchange(path, method, new HttpEntity<>(payload, headers), JsonNode.class);
    }

    private Map<String, Object> request(EmailConfiguration config) {
        // Outbound server DTOs deliberately suppress password; the admin client writes an explicit
        // request object.
        return Map.of(
                "version",
                config.version(),
                "enabled",
                config.enabled(),
                "host",
                config.host(),
                "port",
                config.port(),
                "username",
                config.username(),
                "password",
                config.password(),
                "from",
                config.from(),
                "startTls",
                config.startTls(),
                "ssl",
                config.ssl());
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
