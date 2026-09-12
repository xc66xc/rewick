package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import java.time.Instant;

class PaymentOrderIntegrationTest extends PaymentGatewayFixture {
    @Test
    void create_sameRequest_isIdempotentAndUsesServerPrice() {
        enablePayment();
        var body = orderBody(createPackage(true));
        var first = call(HttpMethod.POST, "/payment-orders", aliceToken, body);
        var repeat = call(HttpMethod.POST, "/payment-orders", aliceToken, body);

        assertThat(first.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(repeat.getBody().path("id")).isEqualTo(first.getBody().path("id"));
        assertThat(first.getBody().path("totalCents").asInt()).isEqualTo(1599);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_orders", Long.class)).isEqualTo(1);
        body.put("totalCents", 1);
        assertThat(call(HttpMethod.POST, "/payment-orders", aliceToken, body).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void create_packageChanged_requiresReconfirmation() {
        enablePayment();
        var plan = createPackage(true);
        var changed = packageBody(true);
        changed.put("version", plan.path("version").asLong());
        changed.put("originalPriceCents", 2999);
        call(HttpMethod.PUT, "/admin/packages/" + plan.path("id").asText(), adminToken, changed);

        assertThat(call(HttpMethod.POST, "/payment-orders", aliceToken, orderBody(plan)).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_orders", Long.class)).isZero();
    }

    @Test
    void readAndRefresh_foreignOrder_cannotInspectOrCredit() {
        var order = pendingOrder();
        String path = "/payment-orders/" + order.path("id").asText();
        paid();

        assertThat(call(HttpMethod.GET, path, bobToken, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(call(HttpMethod.POST, path + "/refresh", bobToken, null).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(call(HttpMethod.GET, "/payment-orders", bobToken, null).getBody()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void refresh_paidRepeatedly_creditsExactlyOnce() {
        var order = pendingOrder();
        paid();
        String path = "/payment-orders/" + order.path("id").asText() + "/refresh";
        var result = call(HttpMethod.POST, path, aliceToken, null);
        assertThat(result.getStatusCode().is2xxSuccessful()).as("refresh: %s", result.getBody()).isTrue();
        assertThat(result.getBody().path("credited").asBoolean()).isTrue();
        call(HttpMethod.POST, path, aliceToken, null);
        call(HttpMethod.POST, "/admin" + path, adminToken, null);

        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class))
                .isEqualTo(3600);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions WHERE operation='purchase'", Long.class))
                .isEqualTo(1);
    }

    @Test
    void refresh_wrongAmount_refusesCredit() {
        var order = pendingOrder();
        allowQuery(order.path("id").asText());
        doAnswer(call -> {
            PaymentConfigDTO config = call.getArgument(0);
            PaymentOrderDTO payment = call.getArgument(1);
            return new PaymentResultDTO(payment.id(), config.mchId(), config.appId(), "invalid-amount",
                    "SUCCESS", "CNY", 1, Instant.now());
        }).when(gateway).query(any(), any());

        var result = call(HttpMethod.POST, "/payment-orders/" + order.path("id").asText() + "/refresh", aliceToken, null);

        assertThat(result.getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void credit_ledgerFailure_rollsBackAndLaterQueryRecovers() {
        var order = pendingOrder();
        paid();
        String id = order.path("id").asText();
        jdbc.execute("ALTER TABLE time_wallet_transactions ADD CONSTRAINT reject_purchase CHECK(operation<>'purchase')");
        try {
            assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/refresh", aliceToken, null)
                    .getStatusCode().isError()).isTrue();
            assertThat(jdbc.queryForObject("SELECT is_credited FROM payment_orders WHERE order_id=?", Boolean.class, id)).isFalse();
            assertThat(jdbc.queryForObject("SELECT COALESCE(SUM(available_seconds),0) FROM time_wallets", Long.class)).isZero();
        } finally {
            jdbc.execute("ALTER TABLE time_wallet_transactions DROP CONSTRAINT reject_purchase");
        }
        allowQuery(id);
        assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/refresh", aliceToken, null)
                .getBody().path("credited").asBoolean()).isTrue();
    }
}
