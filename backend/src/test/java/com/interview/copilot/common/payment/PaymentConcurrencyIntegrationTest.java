package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.interview.copilot.service.wallet.WalletService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

class PaymentConcurrencyIntegrationTest extends PaymentGatewayFixture {
    @Autowired WalletService wallets;

    @Test
    void credit_concurrentRefresh_onlyOneLedgerEntryAndNoLostBalance() throws Exception {
        var order = pendingOrder();
        paid();
        String path = "/payment-orders/" + order.path("id").asText() + "/refresh";
        var start = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = List.of(aliceToken, aliceToken, aliceToken, aliceToken).stream()
                    .map(token -> workers.submit(() -> {
                        start.await();
                        return call(HttpMethod.POST, path, token, null);
                    })).toList();
            start.countDown();
            for (var task : tasks) assertThat(task.get(15, TimeUnit.SECONDS).getStatusCode().is2xxSuccessful()).isTrue();
        }
        assertThat(wallets.state(1).availableSeconds()).isEqualTo(3600);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions WHERE operation='purchase'", Long.class))
                .isEqualTo(1);
    }

    @Test
    void credit_activeInterview_preservesLeaseAndDoesNotStartAnotherSession() {
        var order = pendingOrder();
        wallets.state(1);
        jdbc.update("UPDATE time_wallets SET available_seconds=120 WHERE app_users_id=1");
        var session = wallets.start(1, UUID.randomUUID().toString()).session();
        paid();

        call(HttpMethod.POST, "/payment-orders/" + order.path("id").asText() + "/refresh", aliceToken, null);
        var updated = wallets.state(1);

        assertThat(updated.session().id()).isEqualTo(session.id());
        assertThat(updated.session().expiresAt()).isEqualTo(session.expiresAt());
        assertThat(updated.availableSeconds() + updated.session().usedSeconds()).isEqualTo(3720);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM interview_sessions", Long.class)).isEqualTo(1);
    }

    @Test
    void credit_expiredInterview_settlesOldSecondsAndDoesNotReviveSession() {
        var order = pendingOrder();
        wallets.state(1);
        jdbc.update("UPDATE time_wallets SET available_seconds=10 WHERE app_users_id=1");
        wallets.start(1, UUID.randomUUID().toString());
        jdbc.execute("UPDATE interview_sessions SET started_at=LOCALTIMESTAMP-INTERVAL '30 seconds',"
                + " expires_at=LOCALTIMESTAMP-INTERVAL '20 seconds' WHERE app_users_id=1");
        paid();

        call(HttpMethod.POST, "/payment-orders/" + order.path("id").asText() + "/refresh", aliceToken, null);
        var updated = wallets.state(1);

        assertThat(updated.availableSeconds()).isEqualTo(3600);
        assertThat(updated.session().status()).isEqualTo("ended");
        assertThat(updated.session().usedSeconds()).isEqualTo(10);
    }
}
