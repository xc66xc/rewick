package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.service.payment.WechatPaymentService;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.security.KeyPairGenerator;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

abstract class PaymentGatewayFixture extends PaymentHttpFixture {
    @MockitoBean WechatPaymentService gateway;

    @BeforeEach
    void gateway() {
        when(gateway.create(any(), any())).thenAnswer(call ->
                "weixin://wxpay/bizpayurl?pr=" + call.<PaymentOrderDTO>getArgument(1).id());
        when(gateway.query(any(), any())).thenAnswer(call ->
                result(call.getArgument(0), call.getArgument(1), "NOTPAY"));
    }

    PaymentResultDTO result(PaymentConfigDTO config, PaymentOrderDTO order, String state) {
        return new PaymentResultDTO(order.id(), config.mchId(), config.appId(),
                "fixture-" + order.id(), state, "CNY", order.totalCents(), Instant.now());
    }

    void paid() {
        jdbc.execute("UPDATE payment_orders SET last_query_at=NULL");
        doAnswer(call -> result(call.getArgument(0), call.getArgument(1), "SUCCESS"))
                .when(gateway).query(any(), any());
    }

    Map<String, Object> configuration(long version, boolean enabled) {
        try {
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            var pair = generator.generateKeyPair();
            var body = new LinkedHashMap<String, Object>();
            body.put("version", version);
            body.put("enabled", enabled);
            body.put("mchId", "1900000001");
            body.put("appId", "wx1234567890123456");
            body.put("merchantSerial", "A".repeat(40));
            body.put("wechatPublicKeyId", "PUB_KEY_ID_0112345678901234567890123456789012");
            body.put("notifyUrl", "https://pay.example.com/api/v1/payments/wechat/notify");
            body.put("merchantPrivateKey", pem("PRIVATE KEY", pair.getPrivate().getEncoded()));
            body.put("wechatPublicKey", pem("PUBLIC KEY", pair.getPublic().getEncoded()));
            body.put("apiV3Key", "payment-test-only-32-byte-key-0000");
            return body;
        } catch (java.security.GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }

    private String pem(String type, byte[] value) {
        return "-----BEGIN " + type + "-----\n" + Base64.getMimeEncoder(64, new byte[]{'\n'})
                .encodeToString(value) + "\n-----END " + type + "-----";
    }

    JsonNode enablePayment() {
        var response = call(HttpMethod.PUT, "/admin/payment-config", adminToken, configuration(0, true));
        assertThat(response.getStatusCode().is2xxSuccessful()).as("payment config: %s", response.getBody()).isTrue();
        return response.getBody();
    }

    JsonNode pendingOrder() {
        enablePayment();
        var response = call(HttpMethod.POST, "/payment-orders", aliceToken, orderBody(createPackage(true)));
        assertThat(response.getStatusCode().is2xxSuccessful()).as("create order: %s", response.getBody()).isTrue();
        return response.getBody();
    }

    void allowQuery(String id) {
        jdbc.update("UPDATE payment_orders SET last_query_at=NULL WHERE order_id=?", id);
    }
}
