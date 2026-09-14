package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 验证收银台入口、取消与支付到账的一致性。
 */
class AlipayCheckoutIntegrationTest extends AlipayHttpFixture {
    private String checkout(String id) {
        var response =
                call(HttpMethod.POST, "/payment-orders/" + id + "/checkout", aliceToken, Map.of());
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody().path("checkoutUrl").asText();
    }

    private ResponseEntity<String> submit(String url) {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        return http.exchange(
                "/api/v1/payments/alipay/checkout",
                HttpMethod.POST,
                new HttpEntity<>(url.substring(url.indexOf('?') + 1), headers),
                String.class);
    }

    @Test
    void submit_realSdkRendersSignedPagePayFormWithAllowedSubmitScript() {
        String id = alipayOrder().path("id").asText();
        org.mockito.Mockito.doCallRealMethod().when(alipay).create(any(), any());
        var response = submit(checkout(id));
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody())
                .contains(
                        "alipay.trade.page.pay",
                        "FAST_INSTANT_TRADE_PAY",
                        "https://openapi.alipay.com/gateway.do",
                        "notify_url",
                        "return_url",
                        "15.99",
                        id);
        assertThat(response.getBody()).doesNotContain("display:none");
        assertThat(response.getHeaders().getFirst("Content-Security-Policy"))
                .contains("script-src 'sha256-", "form-action 'self'");
        assertThat(response.getHeaders().getContentType().getCharset())
                .isEqualTo(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test
    void checkout_ownerOnlyAndBrowserConfirmationDoesNotConsume() {
        var order = alipayOrder();
        var id = order.path("id").asText();
        assertThat(order.path("status").asText()).isEqualTo("pending");
        assertThat(order.path("codeUrl").isNull()).isTrue();
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/payment-orders/" + id + "/checkout",
                                        bobToken,
                                        Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(404);
        assertThat(
                        call(HttpMethod.POST, "/payment-orders/" + id + "/checkout", null, Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(401);
        String url = checkout(id);
        var confirm = http.getForEntity(url, String.class);
        assertThat(confirm.getBody()).contains("继续付款");
        assertThat(confirm.getHeaders().getFirst("Cache-Control")).contains("no-store");
        assertThat(confirm.getHeaders().getFirst("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM payment_checkout_tickets WHERE is_consumed",
                                Long.class))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT ticket_hash FROM payment_checkout_tickets", String.class))
                .isNotEqualTo(url.substring(url.indexOf('=') + 1));
    }

    @Test
    void submit_concurrentRequests_consumesOnceAndCanReopenSameOrder() throws Exception {
        String id = alipayOrder().path("id").asText();
        String url = checkout(id);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one =
                    executor.submit(
                            () -> {
                                start.await();
                                return submit(url).getStatusCode().value();
                            });
            var two =
                    executor.submit(
                            () -> {
                                start.await();
                                return submit(url).getStatusCode().value();
                            });
            start.countDown();
            assertThat(List.of(one.get(), two.get())).containsExactlyInAnyOrder(200, 400);
        }
        assertThat(submit(checkout(id)).getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM payment_orders", Long.class))
                .isEqualTo(1);
    }

    @Test
    void submit_expiredAndCancelledTickets_doNotCreateCashier() {
        String id = alipayOrder().path("id").asText();
        String expired = checkout(id);
        jdbc.update(
                "UPDATE payment_checkout_tickets SET expires_at=LOCALTIMESTAMP-INTERVAL '1"
                    + " second'");
        assertThat(submit(expired).getStatusCode().value()).isEqualTo(400);
        String cancelled = checkout(id);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/payment-orders/" + id + "/cancel",
                                        aliceToken,
                                        Map.of())
                                .getBody()
                                .path("status")
                                .asText())
                .isEqualTo("closed");
        assertThat(submit(cancelled).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void cancel_submittedButNotFound_keepsActiveUntilOriginalExpiry() {
        String id = alipayOrder().path("id").asText();
        assertThat(submit(checkout(id)).getStatusCode().value()).isEqualTo(200);
        var cancel =
                call(HttpMethod.POST, "/payment-orders/" + id + "/cancel", aliceToken, Map.of());
        assertThat(cancel.getBody().path("status").asText()).isEqualTo("cancelling");
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/payment-orders/" + id + "/checkout",
                                        aliceToken,
                                        Map.of())
                                .getStatusCode()
                                .value())
                .isEqualTo(400);
        var body = orderBody(createPackage(true));
        body.put("paymentMethod", "alipay");
        assertThat(
                        call(HttpMethod.POST, "/payment-orders", aliceToken, body)
                                .getBody()
                                .path("id")
                                .asText())
                .isEqualTo(id);
        jdbc.update(
                "UPDATE payment_orders SET expires_at=LOCALTIMESTAMP-INTERVAL '1"
                    + " second',last_query_at=NULL");
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/payment-orders/" + id + "/refresh",
                                        aliceToken,
                                        Map.of())
                                .getBody()
                                .path("status")
                                .asText())
                .isEqualTo("closed");
    }

    @Test
    void cancel_racingWithSignedPayment_creditsExactlyOnce() {
        String id = alipayOrder().path("id").asText();
        submit(checkout(id));
        call(HttpMethod.POST, "/payment-orders/" + id + "/cancel", aliceToken, Map.of());
        var fields = signer.sign(signer.payment(id, "TRADE_SUCCESS", "15.99"));
        assertThat(notify(fields).getStatusCode().value()).isEqualTo(200);
        assertThat(notify(fields).getStatusCode().value()).isEqualTo(200);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM time_wallet_transactions WHERE"
                                    + " operation='purchase'",
                                Long.class))
                .isEqualTo(1);
        assertThat(
                        call(HttpMethod.GET, "/payment-orders/" + id, aliceToken, null)
                                .getBody()
                                .path("credited")
                                .asBoolean())
                .isTrue();
    }

    @Test
    void submit_signingFailure_rollsBackTicketConsumption() {
        String id = alipayOrder().path("id").asText();
        String url = checkout(id);
        doThrow(new IllegalStateException("fixture failure")).when(alipay).create(any(), any());
        assertThat(submit(url).getStatusCode().value()).isEqualTo(500);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM payment_checkout_tickets WHERE is_consumed",
                                Long.class))
                .isZero();
        doAnswer(call -> "<form>ready</form>").when(alipay).create(any(), any());
        assertThat(submit(url).getStatusCode().value()).isEqualTo(200);
    }

    @Test
    void submit_usesOrderConfigurationSnapshotAfterAdminEdit() {
        String id = alipayOrder().path("id").asText();
        long original =
                jdbc.queryForObject(
                        "SELECT payment_config_versions_id FROM payment_orders", Long.class);
        var changed = signer.configuration(original, true);
        changed.put("returnUrl", "https://other.example/payment/result");
        assertThat(
                        call(HttpMethod.PUT, "/admin/payment-config/alipay", adminToken, changed)
                                .getStatusCode()
                                .value())
                .isEqualTo(200);
        doAnswer(
                        call -> {
                            com.interview.copilot.dto.payment.AlipayConfigDTO config =
                                    call.getArgument(0);
                            assertThat(config.version()).isEqualTo(original);
                            assertThat(config.returnUrl())
                                    .isEqualTo("https://pay.example.com/payment/result");
                            return "<form>original configuration</form>";
                        })
                .when(alipay)
                .create(any(), any());
        assertThat(submit(checkout(id)).getStatusCode().value()).isEqualTo(200);
    }
}
