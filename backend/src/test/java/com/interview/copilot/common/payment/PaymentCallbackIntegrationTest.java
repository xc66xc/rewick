package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

class PaymentCallbackIntegrationTest extends PaymentGatewayFixture {
    @Test
    void callback_missingHeaders_returnsBadRequest() {
        assertThat(call(HttpMethod.POST, "/payments/wechat/notify", null, "{}").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void callback_concurrentAuthenticatedEvents_creditOnceWithoutBearerLogin() throws Exception {
        var order = pendingOrder();
        when(gateway.notification(any(), any(), any())).thenReturn(new PaymentResultDTO(
                order.path("id").asText(), "1900000001", "wx1234567890123456", "wx-transaction-fixture",
                "SUCCESS", "CNY", 1599, Instant.now()));
        var start = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = List.of(1, 2, 3).stream().map(index -> workers.submit(() -> {
                start.await();
                return callback(Instant.now().getEpochSecond());
            })).toList();
            start.countDown();
            for (var task : tasks) assertThat(task.get(15, TimeUnit.SECONDS).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions WHERE operation='purchase'", Long.class)).isEqualTo(1);
    }

    @Test
    void callback_staleTimestamp_rejectsBeforeParsingAndDoesNotAcknowledge() {
        pendingOrder();

        assertThat(callback(Instant.now().minusSeconds(601).getEpochSecond()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(gateway, never()).notification(any(), any(), any());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void callback_wrongMerchant_rejectsAndLeavesOrderPending() {
        var order = pendingOrder();
        when(gateway.notification(any(), any(), any())).thenReturn(new PaymentResultDTO(
                order.path("id").asText(), "wrong-merchant", "wx1234567890123456", "wx-wrong-fixture",
                "SUCCESS", "CNY", 1599, Instant.now()));

        assertThat(callback(Instant.now().getEpochSecond()).getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    private ResponseEntity<JsonNode> callback(long timestamp) {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Wechatpay-Serial", "PUB_KEY_ID_0112345678901234567890123456789012");
        headers.set("Wechatpay-Nonce", "test-nonce");
        headers.set("Wechatpay-Timestamp", Long.toString(timestamp));
        headers.set("Wechatpay-Signature", "test-signature-verified-by-fake-gateway");
        return http.exchange("/api/v1/payments/wechat/notify", HttpMethod.POST,
                new HttpEntity<>("{\"id\":\"fixture-notification\"}", headers), JsonNode.class);
    }
}
