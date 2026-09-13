package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.auth.AuthService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.service.wallet.WalletService;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

class DesktopSessionsIntegrationTest extends PaymentHttpFixture {
    @Autowired AuthService auth;
    @Autowired WalletService wallets;
    @Autowired UsageService usage;

    private String login(String name, String client) {
        var response =
                call(
                        HttpMethod.POST,
                        "/auth/login",
                        null,
                        Map.of(
                                "identifier",
                                name,
                                "password",
                                "payment-fixture-password",
                                "clientType",
                                client));
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody().path("accessToken").asText();
    }

    private long alice() {
        return jdbc.queryForObject(
                "SELECT id FROM app_users WHERE display_name='alice'", Long.class);
    }

    private String start(String token) {
        UserPrincipal principal = auth.authenticate(token).orElseThrow();
        jdbc.update(
                "INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(?,3600)"
                        + " ON CONFLICT(app_users_id) DO NOTHING",
                principal.id());
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(principal, null, List.of()));
        try {
            return wallets.start(principal.id(), UUID.randomUUID().toString()).session().id();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    void login_replacesOldSessionAndEndsOnlyItsInterview() {
        String old = aliceToken;
        String first = start(old);
        jdbc.update(
                "UPDATE interview_sessions SET started_at=LOCALTIMESTAMP-INTERVAL '5 seconds' WHERE"
                    + " session_id=?",
                first);
        String current = login("alice", "desktop");
        assertThat(call(HttpMethod.GET, "/auth/session", old, null).getBody().path("code").asText())
                .isEqualTo("session_replaced");
        assertThat(
                        jdbc.queryForObject(
                                "SELECT status FROM interview_sessions WHERE session_id=?",
                                String.class,
                                first))
                .isEqualTo("ended");
        long balance =
                jdbc.queryForObject(
                        "SELECT available_seconds FROM time_wallets WHERE app_users_id=?",
                        Long.class,
                        alice());
        assertThat(balance).isBetween(3590L, 3595L);
        String next = start(current);
        assertThat(call(HttpMethod.POST, "/auth/logout", old, Map.of()).getStatusCode().value())
                .isEqualTo(401);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/interview-sessions/" + first + "/heartbeat",
                                        old,
                                        Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(401);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/interview-sessions/" + first + "/end",
                                        current,
                                        Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(403);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT status FROM interview_sessions WHERE session_id=?",
                                String.class,
                                next))
                .isEqualTo("active");
        assertThat(call(HttpMethod.GET, "/auth/session", current, null).getStatusCode().value())
                .isEqualTo(204);
    }

    @Test
    void login_concurrentRequestsLeaveExactlyOneValidDesktopToken() throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        var first = CompletableFuture.supplyAsync(() -> concurrentLogin(ready, go));
        var second = CompletableFuture.supplyAsync(() -> concurrentLogin(ready, go));
        assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
        go.countDown();
        var tokens = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        long valid =
                tokens.stream()
                        .filter(
                                token ->
                                        call(HttpMethod.GET, "/auth/session", token, null)
                                                        .getStatusCode()
                                                        .value()
                                                == 204)
                        .count();
        assertThat(valid).isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM auth_tokens WHERE app_users_id=? AND"
                                    + " client_type='desktop' AND NOT is_revoked",
                                Long.class,
                                alice()))
                .isEqualTo(1L);
    }

    private String concurrentLogin(CountDownLatch ready, CountDownLatch go) {
        ready.countDown();
        try {
            if (!go.await(5, TimeUnit.SECONDS))
                throw new IllegalStateException("Login barrier timed out");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
        return login("alice", "desktop");
    }

    @Test
    void adminSessions_areIndependentAndCannotBypassDesktopScope() {
        String browser = login("administrator", "admin");
        String desktop = login("administrator", "desktop");
        login("administrator", "desktop");
        assertThat(call(HttpMethod.GET, "/auth/session", browser, null).getStatusCode().value())
                .isEqualTo(204);
        assertThat(call(HttpMethod.GET, "/auth/session", desktop, null).getStatusCode().value())
                .isEqualTo(401);
        assertThat(call(HttpMethod.GET, "/wallet", browser, null).getStatusCode().value())
                .isEqualTo(403);
        assertThat(call(HttpMethod.GET, "/admin/me", browser, null).getStatusCode().value())
                .isEqualTo(200);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/auth/login",
                                        null,
                                        Map.of(
                                                "identifier",
                                                "alice",
                                                "password",
                                                "payment-fixture-password",
                                                "clientType",
                                                "admin"))
                                .getStatusCode()
                                .value())
                .isEqualTo(401);
        assertThat(call(HttpMethod.GET, "/auth/session", aliceToken, null).getStatusCode().value())
                .isEqualTo(204);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/auth/login",
                                        null,
                                        Map.of(
                                                "identifier",
                                                "alice",
                                                "password",
                                                "incorrect",
                                                "clientType",
                                                "desktop"))
                                .getStatusCode()
                                .value())
                .isEqualTo(401);
        assertThat(call(HttpMethod.GET, "/auth/session", aliceToken, null).getStatusCode().value())
                .isEqualTo(204);
    }

    @Test
    void staleAuthenticatedRequest_andDelayedAsrStart_cannotAffectNewInterview() {
        UserPrincipal stale = auth.authenticate(aliceToken).orElseThrow();
        String first = start(aliceToken);
        var oldLease = usage.startForSession(alice(), "old-asr", "asr", stale.tokenId());
        String replacement = login("alice", "desktop");
        String next = start(replacement);
        assertThat(oldLease.isActive()).isFalse();
        assertThatThrownBy(
                        () -> usage.startForSession(alice(), "delayed-asr", "asr", stale.tokenId()))
                .isInstanceOf(ApiException.class);
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(stale, null, List.of()));
        try {
            assertThatThrownBy(() -> wallets.endCurrent(alice())).isInstanceOf(ApiException.class);
            assertThatThrownBy(() -> wallets.heartbeat(alice(), first))
                    .isInstanceOf(ApiException.class);
        } finally {
            SecurityContextHolder.clearContext();
        }
        assertThat(
                        jdbc.queryForObject(
                                "SELECT status FROM interview_sessions WHERE session_id=?",
                                String.class,
                                next))
                .isEqualTo("active");
        oldLease.cancel();
    }

    @Test
    void failedReplacement_rollsBackRevocationAndBilling() {
        String first = start(aliceToken);
        jdbc.execute(
                "ALTER TABLE auth_tokens ADD CONSTRAINT reject_replacement CHECK(revoked_reason <>"
                    + " 'session_replaced')");
        try {
            var response =
                    call(
                            HttpMethod.POST,
                            "/auth/login",
                            null,
                            Map.of(
                                    "identifier",
                                    "alice",
                                    "password",
                                    "payment-fixture-password",
                                    "clientType",
                                    "desktop"));
            assertThat(response.getStatusCode().value()).isEqualTo(500);
            assertThat(
                            call(HttpMethod.GET, "/auth/session", aliceToken, null)
                                    .getStatusCode()
                                    .value())
                    .isEqualTo(204);
            assertThat(
                            jdbc.queryForObject(
                                    "SELECT status FROM interview_sessions WHERE session_id=?",
                                    String.class,
                                    first))
                    .isEqualTo("active");
            assertThat(
                            jdbc.queryForObject(
                                    "SELECT count(*) FROM time_wallet_transactions WHERE"
                                        + " app_users_id=?",
                                    Long.class,
                                    alice()))
                    .isZero();
        } finally {
            jdbc.execute("ALTER TABLE auth_tokens DROP CONSTRAINT reject_replacement");
        }
    }
}
