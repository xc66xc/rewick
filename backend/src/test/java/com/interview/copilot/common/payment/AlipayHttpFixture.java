package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.dto.payment.AlipayConfigDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.service.payment.AlipayPaymentService;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.stream.Collectors;

abstract class AlipayHttpFixture extends PaymentGatewayFixture {
    @MockitoSpyBean AlipayPaymentService alipay;
    AlipayTestSigner signer;

    @BeforeEach
    void alipayGateway() {
        signer = new AlipayTestSigner();
        doAnswer(call -> "https://qr.alipay.com/fixture-" + call.<PaymentOrderDTO>getArgument(1).id())
                .when(alipay).create(any(), any());
        doAnswer(call -> {
            AlipayConfigDTO config = call.getArgument(0);
            PaymentOrderDTO order = call.getArgument(1);
            return new PaymentResultDTO(order.id(), config.sellerId(), config.appId(), null,
                    "NOTFOUND", "CNY", order.totalCents(), null, "alipay");
        }).when(alipay).query(any(), any());
    }

    JsonNode enableAlipay() {
        var response = call(HttpMethod.PUT, "/admin/payment-config/alipay", adminToken, signer.configuration(0, true));
        assertThat(response.getStatusCode().is2xxSuccessful()).as("Alipay config: %s", response.getBody()).isTrue();
        return response.getBody();
    }

    JsonNode alipayOrder() {
        enableAlipay();
        var body = orderBody(createPackage(true));
        body.put("paymentMethod", "alipay");
        var response = call(HttpMethod.POST, "/payment-orders", aliceToken, body);
        assertThat(response.getStatusCode().is2xxSuccessful()).as("Alipay order: %s", response.getBody()).isTrue();
        return response.getBody();
    }

    ResponseEntity<String> notify(Map<String, String> fields) {
        return notifyRaw(fields.entrySet().stream().map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(Collectors.joining("&")));
    }

    ResponseEntity<String> notifyRaw(String body) {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        return http.exchange("/api/v1/payments/alipay/notify", HttpMethod.POST,
                new HttpEntity<>(body, headers), String.class);
    }

    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
