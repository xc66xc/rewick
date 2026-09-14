package com.interview.copilot.service.impl.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.util.ZpaySignature;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 验证 ZPAY 表单安全、严格查单及通知校验。
 */
class ZpayPaymentServiceTest {
    private HttpServer server;
    private ZpayConfigDTO config;
    private ZpayPaymentServiceImpl service;
    private String response;
    private String requestedQuery;
    private final PaymentOrderDTO order = new PaymentOrderDTO("123456", 1, "套餐\"<script>&", 60, 120,
            Instant.parse("2026-09-14T12:00:00Z"));

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api.php", exchange -> {
            requestedQuery = exchange.getRequestURI().getRawQuery();
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        server.start();
        config = config("http://127.0.0.1:" + server.getAddress().getPort() + "/api.php");
        service = new ZpayPaymentServiceImpl(new ObjectMapper());
        response = success("1");
    }

    @AfterEach
    void tearDown() { server.stop(0); }

    @Test
    void create_specialCharacters_escapesFormWithoutExposingMerchantKey() {
        String html = service.create(config, order);

        assertThat(html).contains("action=\"https://z-pay.cn/submit.php\"", "套餐&quot;&lt;script&gt;&amp;",
                "document.forms[0].submit();", "name=\"money\" value=\"1.20\"", "name=\"cid\" value=\"456\"")
                .doesNotContain("merchant-secret", "套餐\"<script>");
    }

    @Test
    void query_paidOrder_preservesIdentityAmountAndBeijingPaymentTime() {
        var result = service.query(config, order);

        assertThat(result.state()).isEqualTo("SUCCESS");
        assertThat(result.paidAt()).isEqualTo(Instant.parse("2026-09-14T02:30:00Z"));
        assertThat(result.totalCents()).isEqualTo(120);
        assertThat(result.paymentMethod()).isEqualTo("zpay");
        assertThat(requestedQuery).isEqualTo("act=order&pid=123&key=merchant-secret&out_trade_no=123456");
    }

    @Test
    void query_pendingOrder_returnsNotPay() {
        response = success("0");

        assertThat(service.query(config, order).state()).isEqualTo("NOTPAY");
    }

    @Test
    void query_zpayContentNegotiation_receivesObjectWithoutJsonAcceptHeader() throws Exception {
        server.createContext("/negotiation.php", exchange -> {
            String body = "application/json".equals(exchange.getRequestHeaders().getFirst("Accept"))
                    ? new ObjectMapper().writeValueAsString(response) : response;
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        var target = config("http://127.0.0.1:" + server.getAddress().getPort() + "/negotiation.php");

        assertThat(service.query(target, order).state()).isEqualTo("SUCCESS");
    }

    @Test
    void query_rejectedCode_isErrorInsteadOfNotFound() {
        response = "{\"code\":-1,\"msg\":\"not found\"}";

        assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
    }

    @Test
    void query_confirmedMissingOrder_returnsNotFoundWithoutPaymentEvidence() {
        response = "{\"code\":0,\"msg\":\"订单编号不存在\"}";

        var result = service.query(config, order);

        assertThat(result.state()).isEqualTo("NOTFOUND");
        assertThat(result.orderId()).isEqualTo(order.id());
        assertThat(result.transactionId()).isNull();
        assertThat(result.paidAt()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"code\":0,\"msg\":\"密钥错误\"}",
            "{\"code\":-1,\"msg\":\"订单编号不存在\"}", "{\"code\":0}", "[]", "<html>error</html>"})
    void query_otherFailure_doesNotPretendOrderIsPending(String body) {
        response = body;

        assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
    }

    @Test
    void query_invalidJson_logsDiagnosticsWithoutResponseOrKey() {
        var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(ZpayPaymentServiceImpl.class);
        var appender = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        response = "{\"secret\":\"merchant-secret\",invalid}";
        try {
            assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
            assertThat(appender.list).anySatisfy(event -> assertThat(event.getFormattedMessage())
                    .contains("invalid JSON", "123456", "offset"));
            assertThat(appender.list).allSatisfy(event -> {
                assertThat(event.getFormattedMessage()).doesNotContain("merchant-secret", "key=", response);
                assertThat(event.getThrowableProxy()).isNull();
            });
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"pid", "type", "out_trade_no", "money", "status", "endtime"})
    void query_mismatchedOrMalformedField_rejectsResponse(String field) throws Exception {
        var node = (com.fasterxml.jackson.databind.node.ObjectNode) new ObjectMapper().readTree(response);
        node.put(field, "invalid");
        response = node.toString();

        assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
    }

    @Test
    void query_differentValidAmount_rejectsResponse() {
        response = response.replace("1.20", "1.21");

        assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
    }

    @Test
    void query_redirect_doesNotForwardMerchantCredentials() throws Exception {
        var destinationReached = new java.util.concurrent.atomic.AtomicBoolean();
        server.createContext("/redirect.php", exchange -> {
            exchange.getResponseHeaders().set("Location", "/destination");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/destination", exchange -> {
            destinationReached.set(true);
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        var redirectConfig = config("http://127.0.0.1:" + server.getAddress().getPort() + "/redirect.php");

        assertThatThrownBy(() -> service.query(redirectConfig, order)).isInstanceOf(ApiException.class);
        assertThat(destinationReached).isFalse();
    }

    @Test
    void query_oversizedBody_rejectsResponse() {
        response = " ".repeat(70000);

        assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
    }

    @Test
    void notification_validSignedPayment_requiresLaterQueryForPaymentTime() {
        var parameters = notification();

        var result = service.notification(config, parameters);

        assertThat(result.orderId()).isEqualTo(order.id());
        assertThat(result.state()).isEqualTo("SUCCESS");
        assertThat(result.paidAt()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pid", "type", "trade_no", "money", "trade_status", "name"})
    void notification_signedInvalidFields_rejectsNotification(String field) {
        var parameters = notification();
        parameters.put(field, "");
        parameters.put("sign", ZpaySignature.sign(parameters, config.merchantKey()));

        assertThatThrownBy(() -> service.notification(config, parameters)).isInstanceOf(ApiException.class);
    }

    private HashMap<String, String> notification() {
        var parameters = new HashMap<>(Map.of("pid", "123", "type", "alipay", "out_trade_no", order.id(),
                "trade_no", "987654", "money", "1.20", "trade_status", "TRADE_SUCCESS", "sign_type", "MD5", "name", "套餐"));
        parameters.put("sign", ZpaySignature.sign(parameters, config.merchantKey()));
        return parameters;
    }

    private String success(String status) {
        return "{\"code\":1,\"pid\":123,\"type\":\"alipay\",\"out_trade_no\":\"123456\","
                + "\"trade_no\":\"987654\",\"money\":\"1.20\",\"status\":\"" + status
                + "\",\"endtime\":\"2026-09-14 10:30:00\"}";
    }

    private ZpayConfigDTO config(String queryUrl) {
        return new ZpayConfigDTO(1, true, "123", "alipay", "https://z-pay.cn/submit.php", queryUrl,
                "https://api.example.test/notify", "https://example.test/result", "456", "merchant-secret");
    }
}
