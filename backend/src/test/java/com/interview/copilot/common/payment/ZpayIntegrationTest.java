package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.service.payment.ZpayPaymentService;
import com.interview.copilot.service.payment.PaymentSyncService;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.util.DigestUtils;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 配置、收银台及通知到账真实数据库集成测试
 */
class ZpayIntegrationTest extends PaymentHttpFixture {
    private static final String KEY = "fixture-zpay-merchant-key";
    @MockitoSpyBean ZpayPaymentService zpay;
    @Autowired PaymentSyncService sync;

    @BeforeEach
    void preventProviderNetworkCalls() {
        queryState("NOTPAY", null);
    }

    @Test
    void configuration_adminOnlyEncryptedVersionedAndPreservesBlankKey() {
        assertThat(call(HttpMethod.GET, "/admin/payment-config/zpay", aliceToken, null).getStatusCode().value()).isEqualTo(403);
        assertThat(call(HttpMethod.PUT, "/admin/payment-config/zpay", null, config(0, KEY)).getStatusCode().value()).isEqualTo(401);
        var saved = enable();
        assertThat(saved.path("hasMerchantKey").asBoolean()).isTrue();
        assertThat(saved.has("merchantKey")).isFalse();
        String encrypted = jdbc.queryForObject("SELECT zpay_merchant_key FROM payment_config_versions", String.class);
        assertThat(encrypted).startsWith("v1:").doesNotContain(KEY);
        assertThat(call(HttpMethod.PUT, "/admin/payment-config/zpay", adminToken, config(0, KEY)).getStatusCode().value()).isEqualTo(409);
        assertThat(call(HttpMethod.PUT, "/admin/payment-config/zpay", adminToken, config(saved.path("version").asLong(), "")).getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForList("SELECT zpay_merchant_key FROM payment_config_versions", String.class)).containsOnly(encrypted);
    }

    @Test
    void checkout_ownerOnlySingleUseAndSignedFormNeverExposesMerchantKey() {
        String id = order().path("id").asText();
        assertThat(id).matches("[0-9]{32}");
        assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/checkout", bobToken, Map.of()).getStatusCode().value()).isEqualTo(404);
        assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/checkout", null, Map.of()).getStatusCode().value()).isEqualTo(401);
        String ticket = checkout(id);
        assertThat(http.getForEntity(ticket, String.class).getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM payment_checkout_tickets WHERE is_consumed", Long.class)).isZero();
        var form = submit(ticket);
        assertThat(form.getStatusCode().value()).isEqualTo(200);
        assertThat(form.getBody()).contains("https://zpayz.cn/submit.php", "sign_type", "MD5", "15.99", id)
                .doesNotContain(KEY, "merchantKey");
        assertThat(submit(ticket).getStatusCode().value()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM payment_orders WHERE payment_method='zpay'", Long.class)).isEqualTo(1);
    }

    @Test
    void cancel_thenNewOrder_lateConcurrentNotificationsCreditOldOrderExactlyOnce() throws Exception {
        String id = order().path("id").asText();
        assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/cancel", aliceToken, Map.of()).getBody().path("status").asText()).isEqualTo("closed");
        var next = createOrder();
        assertThat(next.path("id").asText()).isNotEqualTo(id);
        queryState("SUCCESS", KEY);
        String signed = signed(id, "15.99", KEY);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> { start.await(); return notifyRaw(signed).getStatusCode().value(); });
            var two = executor.submit(() -> { start.await(); return notifyRaw(signed).getStatusCode().value(); });
            start.countDown();
            assertThat(List.of(one.get(), two.get())).containsExactly(200, 200);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM time_wallet_transactions WHERE operation='purchase'", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
    }

    @Test
    void notification_invalidSignatureDuplicateParametersAndWrongAmount_neverCredit() {
        String id = order().path("id").asText();
        queryState("SUCCESS", KEY);
        assertThat(notifyRaw(signed(id, "15.99", "wrong-key")).getStatusCode().isError()).isTrue();
        assertThat(notifyRaw(signed(id, "15.99", KEY) + "&money=15.99").getStatusCode().isError()).isTrue();
        assertThat(notifyRaw(signed(id, "0.01", KEY)).getStatusCode().isError()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void notification_queryFailureRetriesUsingOriginalKeyAfterConfigurationRotation() {
        String id = order().path("id").asText();
        long version = jdbc.queryForObject("SELECT id FROM payment_config_versions", Long.class);
        assertThat(call(HttpMethod.PUT, "/admin/payment-config/zpay", adminToken, config(version, "replacement-key")).getStatusCode().value()).isEqualTo(200);
        doThrow(PaymentErrors.upstream()).when(zpay).query(any(), any());
        assertThat(notifyRaw(signed(id, "15.99", KEY)).getStatusCode().value()).isEqualTo(502);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM time_wallet_transactions", Long.class)).isZero();
        queryState("SUCCESS", KEY);
        assertThat(notifyRaw(signed(id, "15.99", KEY)).getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
    }

    @Test
    void expiredOrder_blocksCheckoutButLateVerifiedNotificationCredits() {
        String id = order().path("id").asText();
        String ticket = checkout(id);
        jdbc.update("UPDATE payment_orders SET expires_at=LOCALTIMESTAMP-INTERVAL '1 second',last_query_at=NULL");
        assertThat(submit(ticket).getStatusCode().value()).isEqualTo(400);
        assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/checkout", aliceToken, Map.of()).getStatusCode().isError()).isTrue();
        queryState("SUCCESS", KEY);
        assertThat(notifyRaw(signed(id, "15.99", KEY)).getBody()).isEqualTo("success");
        assertThat(jdbc.queryForObject("SELECT is_credited FROM payment_orders WHERE order_id=?", Boolean.class, id)).isTrue();
    }

    @Test
    void closedOrder_manualRefreshRecoversVerifiedPayment() {
        String id = order().path("id").asText();
        assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/cancel", aliceToken, Map.of()).getBody().path("status").asText()).isEqualTo("closed");
        queryState("SUCCESS", KEY);
        jdbc.update("UPDATE payment_orders SET last_query_at=NULL");
        var refreshed = call(HttpMethod.POST, "/payment-orders/" + id + "/refresh", aliceToken, Map.of());
        assertThat(refreshed.getStatusCode().value()).isEqualTo(200);
        assertThat(refreshed.getBody().path("credited").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("SELECT available_seconds FROM time_wallets WHERE app_users_id=1", Long.class)).isEqualTo(3600);
    }

    @Test
    void reconciliation_submittedClosedOrder_recoversLatePayment() {
        String id = order().path("id").asText();
        assertThat(submit(checkout(id)).getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.POST, "/payment-orders/" + id + "/cancel", aliceToken, Map.of()).getBody().path("status").asText()).isEqualTo("closed");
        queryState("SUCCESS", KEY);
        jdbc.update("UPDATE payment_orders SET last_query_at=LOCALTIMESTAMP-INTERVAL '6 minutes'");
        sync.reconcile();
        assertThat(jdbc.queryForObject("SELECT is_credited FROM payment_orders WHERE order_id=?", Boolean.class, id)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM time_wallet_transactions WHERE operation='purchase'", Long.class)).isEqualTo(1);
    }

    private void queryState(String state, String expectedKey) {
        doAnswer(call -> {
            ZpayConfigDTO config = call.getArgument(0);
            PaymentOrderDTO order = call.getArgument(1);
            if (expectedKey != null) assertThat(config.merchantKey()).isEqualTo(expectedKey);
            return new PaymentResultDTO(order.id(), config.pid(), config.paymentType(), "T" + order.id(),
                    state, "CNY", order.totalCents(), "SUCCESS".equals(state) ? Instant.now() : null, "zpay");
        }).when(zpay).query(any(), any());
    }

    private Map<String, Object> config(long version, String key) {
        var result = new LinkedHashMap<String, Object>();
        result.put("version", version);
        result.put("enabled", true);
        result.put("pid", "12345");
        result.put("paymentType", "alipay");
        result.put("gatewayUrl", "https://zpayz.cn/submit.php");
        result.put("queryUrl", "https://zpayz.cn/api.php");
        result.put("notifyUrl", "https://api.junshi.icu/api/v1/payments/zpay/notify");
        result.put("returnUrl", "https://junshi.icu/payment/result");
        result.put("cid", "");
        result.put("merchantKey", key);
        return result;
    }

    private JsonNode enable() {
        var response = call(HttpMethod.PUT, "/admin/payment-config/zpay", adminToken, config(0, KEY));
        assertThat(response.getStatusCode().value()).as("%s", response.getBody()).isEqualTo(200);
        return response.getBody();
    }

    private JsonNode order() {
        enable();
        return createOrder();
    }

    private JsonNode createOrder() {
        var body = orderBody(createPackage(true));
        body.put("paymentMethod", "zpay");
        var response = call(HttpMethod.POST, "/payment-orders", aliceToken, body);
        assertThat(response.getStatusCode().is2xxSuccessful()).as("%s", response.getBody()).isTrue();
        return response.getBody();
    }

    private String checkout(String id) {
        var response = call(HttpMethod.POST, "/payment-orders/" + id + "/checkout", aliceToken, Map.of());
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody().path("checkoutUrl").asText();
    }

    private ResponseEntity<String> submit(String url) {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        return http.exchange("/api/v1/payments/zpay/checkout", HttpMethod.POST,
                new HttpEntity<>(url.substring(url.indexOf('?') + 1), headers), String.class);
    }

    private String signed(String id, String money, String key) {
        var parameters = new TreeMap<>(Map.of("pid", "12345", "type", "alipay", "name", "标准面试",
                "trade_no", "T" + id, "out_trade_no", id, "money", money, "trade_status", "TRADE_SUCCESS"));
        String canonical = parameters.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining("&"));
        parameters.put("sign", DigestUtils.md5DigestAsHex((canonical + key).getBytes(StandardCharsets.UTF_8)));
        parameters.put("sign_type", "MD5");
        return parameters.entrySet().stream().map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8)
                + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8)).collect(Collectors.joining("&"));
    }

    private ResponseEntity<String> notifyRaw(String query) {
        return http.getForEntity(java.net.URI.create(http.getRootUri() + "/api/v1/payments/zpay/notify?" + query), String.class);
    }
}
