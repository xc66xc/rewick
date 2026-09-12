package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.atLeastOnce;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

class PaymentAdministrationIntegrationTest extends PaymentGatewayFixture {
    @Test
    void config_secrets_areEncryptedAndNeverReturned() {
        var body = configuration(0, true);
        var result = call(HttpMethod.PUT, "/admin/payment-config", adminToken, body);
        assertThat(result.getStatusCode().is2xxSuccessful()).isTrue();
        var stored = call(HttpMethod.GET, "/admin/payment-config", adminToken, null).getBody();

        assertThat(stored.path("hasApiV3Key").asBoolean()).isTrue();
        assertThat(stored.path("hasMerchantPrivateKey").asBoolean()).isTrue();
        assertThat(stored.toString()).doesNotContain(body.get("apiV3Key").toString(), "BEGIN PRIVATE KEY");
        String encrypted = jdbc.queryForObject("SELECT api_v3_key FROM payment_config_versions ORDER BY id DESC LIMIT 1", String.class);
        assertThat(encrypted).startsWith("v1:").doesNotContain(body.get("apiV3Key").toString());

        body.put("version", stored.path("version").asLong());
        body.put("merchantPrivateKey", "");
        body.put("apiV3Key", "");
        body.put("wechatPublicKey", "");
        var saved = call(HttpMethod.PUT, "/admin/payment-config", adminToken, body);
        assertThat(saved.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(saved.getBody().path("hasApiV3Key").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_config_versions", Long.class)).isEqualTo(2);
    }

    @Test
    void disablePayment_existingOrderCanStillBePaid() {
        var order = pendingOrder();
        var config = call(HttpMethod.GET, "/admin/payment-config", adminToken, null).getBody();
        var body = configuration(config.path("version").asLong(), false);
        assertThat(call(HttpMethod.PUT, "/admin/payment-config", adminToken, body).getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(call(HttpMethod.GET, "/packages", aliceToken, null).getBody().path("paymentAvailable").asBoolean()).isFalse();
        paid();

        var result = call(HttpMethod.POST, "/payment-orders/" + order.path("id").asText() + "/refresh", aliceToken, null);

        assertThat(result.getBody().path("credited").asBoolean()).isTrue();
        verify(gateway, atLeastOnce()).query(org.mockito.ArgumentMatchers.argThat(value -> value.version() == config.path("version").asLong()), any());
        verify(gateway, never()).query(org.mockito.ArgumentMatchers.argThat(value -> value.version() != config.path("version").asLong()), any());
    }

    @Test
    void manualRefund_repeatedSubmission_deductsOnceAndNeverCallsWechatRefund() {
        var order = pendingOrder();
        paid();
        String path = "/payment-orders/" + order.path("id").asText();
        call(HttpMethod.POST, path + "/refresh", aliceToken, null);
        var refund = new LinkedHashMap<>(Map.<String, Object>of("requestId", UUID.randomUUID().toString(),
                "refundCents", 500, "deductSeconds", 1200, "reference", "merchant-manual-refund-01", "reason", "人工退款已完成"));

        var result = call(HttpMethod.POST, "/admin" + path + "/refund", adminToken, refund);
        assertThat(result.getStatusCode().is2xxSuccessful()).as("refund: %s", result.getBody()).isTrue();
        assertThat(result.getBody().path("refundedCents").asInt()).isEqualTo(500);
        assertThat(call(HttpMethod.POST, "/admin" + path + "/refund", adminToken, refund).getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(2400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_manual_refunds", Long.class)).isEqualTo(1);
        refund.put("requestId", UUID.randomUUID().toString());
        assertThat(call(HttpMethod.POST, "/admin" + path + "/refund", adminToken, refund).getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(2400);
        refund.put("deductSeconds", 1000);
        assertThat(call(HttpMethod.POST, "/admin" + path + "/refund", adminToken, refund).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        verify(gateway, never()).close(any(), any());
    }

    @Test
    void manualRefund_excessiveDeduction_leavesWalletAndOrderUntouched() {
        var order = pendingOrder();
        paid();
        String path = "/payment-orders/" + order.path("id").asText();
        call(HttpMethod.POST, path + "/refresh", aliceToken, null);
        jdbc.update("UPDATE time_wallets SET available_seconds=10 WHERE app_users_id=1");
        var refund = Map.of("requestId", UUID.randomUUID().toString(), "refundCents", 500,
                "deductSeconds", 1200, "reference", "completed-in-merchant-console", "reason", "人工退款登记");

        assertThat(call(HttpMethod.POST, "/admin" + path + "/refund", adminToken, refund).getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_manual_refunds", Long.class)).isZero();
        assertThat(call(HttpMethod.GET, path, aliceToken, null).getBody().path("refundedCents").asInt()).isZero();
    }
}
