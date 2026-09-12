package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import java.util.Map;
import java.util.UUID;

class AlipayAdministrationIntegrationTest extends AlipayHttpFixture {
    @Test
    void config_secretsAreEncryptedAndBlankUpdatePreservesThem() {
        var saved = enableAlipay();
        var body = signer.configuration(saved.path("version").asLong(), true);
        String privateKey = body.get("appPrivateKey").toString();
        assertThat(saved.toString()).doesNotContain(privateKey);
        assertThat(saved.path("hasAppPrivateKey").asBoolean()).isTrue();
        String encrypted = jdbc.queryForObject("SELECT app_private_key FROM payment_config_versions WHERE payment_method='alipay'", String.class);
        assertThat(encrypted).startsWith("v1:").doesNotContain(privateKey);

        body.put("appPrivateKey", "");
        body.put("alipayPublicKey", "");
        var updated = call(HttpMethod.PUT, "/admin/payment-config/alipay", adminToken, body);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody().path("hasAppPrivateKey").asBoolean()).isTrue();
        assertThat(call(HttpMethod.GET, "/admin/payment-config/alipay", aliceToken, null).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void disabledChannel_hidesFromCatalogButOldSignedOrderStillCredits() {
        var order = alipayOrder();
        var config = call(HttpMethod.GET, "/admin/payment-config/alipay", adminToken, null).getBody();
        var disabled = signer.configuration(config.path("version").asLong(), false);
        assertThat(call(HttpMethod.PUT, "/admin/payment-config/alipay", adminToken, disabled).getStatusCode()).isEqualTo(HttpStatus.OK);
        var catalog = call(HttpMethod.GET, "/packages", aliceToken, null).getBody();
        assertThat(catalog.path("paymentMethods").toString()).isEqualTo("[]");
        assertThat(catalog.path("paymentAvailable").asBoolean()).isFalse();

        var result = notify(signer.sign(signer.payment(order.path("id").asText(), "TRADE_SUCCESS", "15.99")));
        assertThat(result.getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
    }

    @Test
    void order_channelIsRequiredAndRequestCannotChangeChannel() {
        enableAlipay();
        enablePayment();
        var catalog = call(HttpMethod.GET, "/packages", aliceToken, null).getBody();
        assertThat(catalog.path("paymentMethods").toString()).contains("wechat", "alipay");
        var body = orderBody(createPackage(true));
        body.remove("paymentMethod");
        assertThat(call(HttpMethod.POST, "/payment-orders", aliceToken, body).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        body.put("paymentMethod", "alipay");
        var order = call(HttpMethod.POST, "/payment-orders", aliceToken, body);
        assertThat(order.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(order.getBody().path("paymentMethod").asText()).isEqualTo("alipay");
        body.put("paymentMethod", "wechat");
        assertThat(call(HttpMethod.POST, "/payment-orders", aliceToken, body).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(call(HttpMethod.GET, "/payment-orders/" + order.getBody().path("id").asText(), bobToken, null)
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void alipayCallback_cannotCreditWechatOrder() {
        enableAlipay();
        var order = pendingOrder();
        var result = notify(signer.sign(signer.payment(order.path("id").asText(), "TRADE_SUCCESS", "15.99")));
        assertThat(result.getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void rotatedSigningKey_oldOrderUsesItsOriginalConfiguration() {
        var order = alipayOrder();
        var config = call(HttpMethod.GET, "/admin/payment-config/alipay", adminToken, null).getBody();
        var replacement = new AlipayTestSigner();
        var body = replacement.configuration(config.path("version").asLong(), true);
        assertThat(call(HttpMethod.PUT, "/admin/payment-config/alipay", adminToken, body).getStatusCode()).isEqualTo(HttpStatus.OK);
        var payment = signer.payment(order.path("id").asText(), "TRADE_SUCCESS", "15.99");
        assertThat(notify(replacement.sign(payment)).getStatusCode().isError()).isTrue();
        assertThat(notify(signer.sign(payment)).getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
    }

    @Test
    void sameTransactionAndRefundReference_inDifferentChannels_doNotCollide() {
        var wechatOrder = pendingOrder();
        paid();
        var paidWechat = call(HttpMethod.POST, "/payment-orders/" + wechatOrder.path("id").asText() + "/refresh", aliceToken, null);
        assertThat(paidWechat.getBody().path("credited").asBoolean()).isTrue();
        var alipayOrder = alipayOrder();
        var fields = signer.payment(alipayOrder.path("id").asText(), "TRADE_SUCCESS", "15.99");
        fields.put("trade_no", "fixture-" + wechatOrder.path("id").asText());
        assertThat(notify(signer.sign(fields)).getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(7200);

        for (var order : java.util.List.of(alipayOrder, wechatOrder)) {
            var refund = Map.of("requestId", UUID.randomUUID().toString(), "refundCents", 100,
                    "deductSeconds", 100, "reference", "shared-reference", "reason", "已人工退款");
            var result = call(HttpMethod.POST, "/admin/payment-orders/" + order.path("id").asText() + "/refund", adminToken, refund);
            assertThat(result.getStatusCode()).as("refund: %s", result.getBody()).isEqualTo(HttpStatus.OK);
        }
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(7000);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_manual_refunds", Long.class)).isEqualTo(2);
    }
}
