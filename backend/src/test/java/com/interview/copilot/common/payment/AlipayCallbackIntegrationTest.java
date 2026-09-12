package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

class AlipayCallbackIntegrationTest extends AlipayHttpFixture {
    @ParameterizedTest
    @ValueSource(strings = {"TRADE_SUCCESS", "TRADE_FINISHED"})
    void callback_validSignedPayment_creditsOnceAndRepliesLiteralSuccess(String status) {
        var order = alipayOrder();
        var fields = signer.payment(order.path("id").asText(), status, "15.99");
        fields.put("subject", "面试套餐 + 时长 & 服务");
        fields.put("receipt_amount", "14.99");
        var signed = signer.sign(fields);

        var result = notify(signed);

        assertThat(result.getStatusCode()).as("callback: %s", result.getBody()).isEqualTo(HttpStatus.OK);
        assertThat(result.getBody()).isEqualTo("success");
        assertThat(notify(signed).getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions WHERE operation='purchase'", Long.class)).isEqualTo(1);
    }

    @Test
    void callback_modifiedSignedAmount_isRejectedWithoutCredit() {
        var order = alipayOrder();
        var fields = signer.sign(signer.payment(order.path("id").asText(), "TRADE_SUCCESS", "15.99"));
        fields.put("total_amount", "0.01");

        assertThat(notify(fields).getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"seller_id", "app_id", "total_amount"})
    void callback_signedButDifferentOrderIdentityOrAmount_isRejected(String field) {
        var order = alipayOrder();
        var fields = signer.payment(order.path("id").asText(), "TRADE_SUCCESS", "15.99");
        fields.put(field, field.equals("total_amount") ? "0.01" : "9999999999999999");

        assertThat(notify(signer.sign(fields)).getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void callback_duplicateFormParameter_isRejectedBeforeCredit() {
        alipayOrder();
        assertThat(notifyRaw("out_trade_no=one&out_trade_no=two&sign=fixture&sign_type=RSA2")
                .getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"WAIT_BUYER_PAY", "UNKNOWN"})
    void callback_unpaidOrUnknownStatus_doesNotAcknowledgeOrCredit(String status) {
        var order = alipayOrder();
        assertThat(notify(signer.sign(signer.payment(order.path("id").asText(), status, "15.99")))
                .getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void callback_oldBusinessNotificationTime_validRetryStillCredits() {
        var order = alipayOrder();
        var payment = signer.payment(order.path("id").asText(), "TRADE_SUCCESS", "15.99");
        payment.put("notify_time", "2026-09-11 10:00:00");
        assertThat(notify(signer.sign(payment)).getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
    }

    @Test
    void callback_closedTrade_acknowledgesWithoutCrediting() {
        var order = alipayOrder();
        var result = notify(signer.sign(signer.payment(order.path("id").asText(), "TRADE_CLOSED", "15.99")));

        assertThat(result.getStatusCode()).as("close callback: %s", result.getBody()).isEqualTo(HttpStatus.OK);
        assertThat(result.getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
        assertThat(call(HttpMethod.GET, "/payment-orders/" + order.path("id").asText(), aliceToken, null)
                .getBody().path("status").asText()).isEqualTo("closed");
    }

    @Test
    void callback_concurrentValidNotifications_createOneCredit() throws Exception {
        var order = alipayOrder();
        var signed = signer.sign(signer.payment(order.path("id").asText(), "TRADE_SUCCESS", "15.99"));
        var start = new CountDownLatch(1);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = List.of(1, 2, 3).stream().map(index -> pool.submit(() -> {
                start.await();
                return notify(signed);
            })).toList();
            start.countDown();
            for (var task : tasks) assertThat(task.get(15, TimeUnit.SECONDS).getBody()).isEqualTo("success");
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions WHERE operation='purchase'", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
    }
}
