package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

class SinglePendingOrderIntegrationTest extends PaymentGatewayFixture {
    @Test
    void create_otherPackageAndChannel_reusesPendingOrderButOtherUserIsIndependent() {
        var first = pendingOrder();
        var body = orderBody(createPackage(true));
        body.put("paymentMethod", "alipay");
        var repeat = call(HttpMethod.POST, "/payment-orders", aliceToken, body);
        assertThat(repeat.getBody().path("id")).isEqualTo(first.path("id"));
        body.put("paymentMethod", "wechat");
        var otherUser = call(HttpMethod.POST, "/payment-orders", bobToken, body);
        assertThat(otherUser.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(otherUser.getBody().path("id")).isNotEqualTo(first.path("id"));
    }

    @Test
    void create_concurrentDifferentRequests_reusesOneUserOrder() throws Exception {
        enablePayment();
        var plan = createPackage(true);
        var start = new CountDownLatch(1);
        var ids = new ArrayList<Future<String>>();
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 4; i++) {
                var body = orderBody(plan);
                ids.add(workers.submit(() -> {
                    start.await();
                    var response = call(HttpMethod.POST, "/payment-orders", aliceToken, body);
                    assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
                    return response.getBody().path("id").asText();
                }));
            }
            start.countDown();
            var first = ids.getFirst().get(20, TimeUnit.SECONDS);
            for (var id : ids) assertThat(id.get(20, TimeUnit.SECONDS)).isEqualTo(first);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_orders", Long.class)).isEqualTo(1);
    }

    @Test
    void cancel_ownerClosesOrder_allowsNewPurchase() {
        var order = pendingOrder();
        var path = "/payment-orders/" + order.path("id").asText() + "/cancel";
        assertThat(call(HttpMethod.POST, path, bobToken, null).getStatusCode().value()).isEqualTo(404);
        assertThat(call(HttpMethod.POST, path, aliceToken, null).getBody().path("status").asText()).isEqualTo("closed");
        var next = call(HttpMethod.POST, "/payment-orders", aliceToken, orderBody(createPackage(true)));
        assertThat(next.getBody().path("id")).isNotEqualTo(order.path("id"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_orders", Long.class)).isEqualTo(2);
    }

    @Test
    void create_expiredOrder_closesBeforeNewPurchase() {
        var order = pendingOrder();
        jdbc.execute("UPDATE payment_orders SET expires_at=LOCALTIMESTAMP-INTERVAL '1 minute',last_query_at=NULL");
        var next = call(HttpMethod.POST, "/payment-orders", aliceToken, orderBody(createPackage(true)));
        assertThat(next.getBody().path("id")).isNotEqualTo(order.path("id"));
        assertThat(jdbc.queryForObject("SELECT status FROM payment_orders WHERE order_id=?", String.class,
                order.path("id").asText())).isEqualTo("closed");
    }

    @Test
    void cancel_providerFailure_keepsExistingOrder() {
        var order = pendingOrder();
        doThrow(new IllegalStateException("provider unavailable")).when(gateway).close(any(), any());
        var response = call(HttpMethod.POST, "/payment-orders/" + order.path("id").asText() + "/cancel", aliceToken, null);
        assertThat(response.getStatusCode().is5xxServerError()).isTrue();
        var next = call(HttpMethod.POST, "/payment-orders", aliceToken, orderBody(createPackage(true)));
        assertThat(next.getBody().path("id")).isEqualTo(order.path("id"));
    }

    @Test
    void cancel_alreadyPaid_creditsInsteadOfClosing() {
        var order = pendingOrder();
        paid();
        var response = call(HttpMethod.POST, "/payment-orders/" + order.path("id").asText() + "/cancel", aliceToken, null);
        assertThat(response.getBody().path("credited").asBoolean()).isTrue();
        assertThat(response.getBody().path("status").asText()).isEqualTo("paid");
    }
}
