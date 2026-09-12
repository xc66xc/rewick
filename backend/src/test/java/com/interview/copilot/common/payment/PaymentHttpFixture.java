package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Import;
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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Tag("integration")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode =
        org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "copilot.auth.bootstrap-username=", "copilot.auth.bootstrap-password=",
        "copilot.auth.admin.bootstrap-username=", "copilot.auth.admin.bootstrap-password=",
        "copilot.auth.login-burst=1000",
        "copilot.platform.master-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
@Import(PaymentHttpFixture.FastPasswords.class)
abstract class PaymentHttpFixture {
    @Container static final PaymentDatabase DATABASE = new PaymentDatabase();
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    String adminToken;
    String aliceToken;
    String bobToken;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", DATABASE::getUsername);
        properties.add("spring.datasource.password", DATABASE::getPassword);
    }

    @BeforeEach
    void accounts() {
        jdbc.execute("TRUNCATE app_users, time_packages, payment_config_versions RESTART IDENTITY CASCADE");
        aliceToken = account("alice", "USER");
        bobToken = account("bob", "USER");
        adminToken = account("administrator", "ADMIN");
    }

    private String account(String name, String role) {
        String password = "payment-fixture-password";
        long id = jdbc.queryForObject("INSERT INTO app_users(display_name,password_hash,role)"
                + " VALUES(?,?,?) RETURNING id", Long.class, name, passwords.encode(password), role);
        jdbc.update("INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at)"
                + " VALUES(?,'account',?,LOCALTIMESTAMP)", id, name);
        var response = call(HttpMethod.POST, "/auth/login", null,
                Map.of("identifier", name, "password", password));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().path("accessToken").asText();
    }

    ResponseEntity<JsonNode> call(HttpMethod method, String path, String token, Object body) {
        var headers = new HttpHeaders();
        if (token != null) headers.setBearerAuth(token);
        return http.exchange("/api/v1" + path, method, new HttpEntity<>(body, headers), JsonNode.class);
    }

    Map<String, Object> packageBody(boolean enabled) {
        return new LinkedHashMap<>(Map.of("name", "标准面试", "description", "永久有效",
                "durationSeconds", 3600, "originalPriceCents", 1999, "discountBps", 8000,
                "sortOrder", 0, "enabled", enabled));
    }

    JsonNode createPackage(boolean enabled) {
        var response = call(HttpMethod.POST, "/admin/packages", adminToken, packageBody(enabled));
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        return response.getBody();
    }

    Map<String, Object> orderBody(JsonNode plan) {
        return new LinkedHashMap<>(Map.of("packageId", plan.path("id").asLong(),
                "packageVersion", plan.path("version").asLong(), "requestId", UUID.randomUUID().toString()));
    }

    @TestConfiguration
    static class FastPasswords {
        @Bean @Primary
        PasswordEncoder testPasswords() { return new BCryptPasswordEncoder(4); }
    }
}
