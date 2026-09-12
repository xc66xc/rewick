package com.interview.copilot.service.impl.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

import com.alipay.api.AlipayApiException;
import com.alipay.api.AlipayConfig;
import com.alipay.api.DefaultAlipayClient;
import com.alipay.api.domain.AlipayTradePrecreateModel;
import com.alipay.api.request.AlipayTradeCloseRequest;
import com.alipay.api.request.AlipayTradePrecreateRequest;
import com.alipay.api.request.AlipayTradeQueryRequest;
import com.alipay.api.response.AlipayTradeCloseResponse;
import com.alipay.api.response.AlipayTradePrecreateResponse;
import com.alipay.api.response.AlipayTradeQueryResponse;
import com.interview.copilot.dto.payment.AlipayConfigDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.security.KeyPairGenerator;
import java.io.IOException;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;

class AlipayPaymentServiceTest {
    private final AlipayPaymentServiceImpl service = new AlipayPaymentServiceImpl();
    private final PaymentOrderDTO order =
            new PaymentOrderDTO(
                    "order-123", 1, "面试 & 测试", 3600, 1599, Instant.parse("2026-09-12T02:15:00Z"));
    private final AlipayConfigDTO config = configuration();

    @Test
    void create_passesSnapshotAmountAndOriginalExpiryToRsa2Client() throws Exception {
        var response = new AlipayTradePrecreateResponse();
        response.setCode("10000");
        response.setOutTradeNo(order.id());
        response.setQrCode("https://qr.alipay.com/test");
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) -> {
                            var settings = (AlipayConfig) context.arguments().getFirst();
                            assertThat(settings.getSignType()).isEqualTo("RSA2");
                            assertThat(settings.getAlipayPublicKey()).isNotBlank();
                            when(client.execute(any(AlipayTradePrecreateRequest.class)))
                                    .thenReturn(response);
                        })) {
            assertThat(service.create(config, order)).isEqualTo("https://qr.alipay.com/test");
            var request = ArgumentCaptor.forClass(AlipayTradePrecreateRequest.class);
            verify(clients.constructed().getFirst()).execute(request.capture());
            var model = (AlipayTradePrecreateModel) request.getValue().getBizModel();
            assertThat(model.getTotalAmount()).isEqualTo("15.99");
            assertThat(model.getTimeExpire()).isEqualTo("2026-09-12 10:15:00");
            assertThat(model.getOutTradeNo()).isEqualTo(order.id());
            assertThat(model.getSellerId()).isEqualTo(config.sellerId());
            assertThat(request.getValue().getNotifyUrl()).isEqualTo(config.notifyUrl());
        }
    }

    @Test
    void query_completedTrade_mapsExactCentsAndPaymentInstant() throws Exception {
        var response = paidResponse("15.99", "TRADE_FINISHED");
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradeQueryRequest.class)))
                                        .thenReturn(response))) {
            var result = service.query(config, order);
            assertThat(result.totalCents()).isEqualTo(1599);
            assertThat(result.state()).isEqualTo("SUCCESS");
            assertThat(result.paymentMethod()).isEqualTo("alipay");
            assertThat(result.paidAt()).isEqualTo(response.getSendPayDate().toInstant());
        }
    }

    @Test
    void query_nonexistentTrade_reportsNotFoundForSameOrder() throws Exception {
        var response = new AlipayTradeQueryResponse();
        response.setCode("40004");
        response.setSubCode("ACQ.TRADE_NOT_EXIST");
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradeQueryRequest.class)))
                                        .thenReturn(response))) {
            var result = service.query(config, order);
            assertThat(result.state()).isEqualTo("NOTFOUND");
            assertThat(result.orderId()).isEqualTo(order.id());
        }
    }

    @Test
    void query_transientGatewayIoFailure_retriesReadOnlyQuery() throws Exception {
        var response = paidResponse("15.99", "TRADE_SUCCESS");
        try (var clients = mockConstruction(DefaultAlipayClient.class, (client, context) ->
                when(client.execute(any(AlipayTradeQueryRequest.class)))
                        .thenThrow(new AlipayApiException(new IOException("404 Not Found")))
                        .thenReturn(response))) {
            assertThat(service.query(config, order).state()).isEqualTo("SUCCESS");
            verify(clients.constructed().getFirst(), times(2))
                    .execute(any(AlipayTradeQueryRequest.class));
        }
    }

    @Test
    void query_persistentIoFailure_stopsAfterThreeAttempts() throws Exception {
        try (var clients = mockConstruction(DefaultAlipayClient.class, (client, context) ->
                when(client.execute(any(AlipayTradeQueryRequest.class)))
                        .thenThrow(new AlipayApiException(new IOException("404 Not Found"))))) {
            assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
            verify(clients.constructed().getFirst(), times(3))
                    .execute(any(AlipayTradeQueryRequest.class));
        }
    }

    @Test
    void query_signatureFailure_doesNotRetry() throws Exception {
        try (var clients = mockConstruction(DefaultAlipayClient.class, (client, context) ->
                when(client.execute(any(AlipayTradeQueryRequest.class)))
                        .thenThrow(new AlipayApiException("CHECK_SIGN_ERROR", "Invalid signature")))) {
            assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
            verify(clients.constructed().getFirst()).execute(any(AlipayTradeQueryRequest.class));
        }
    }

    @Test
    void query_fractionalCentAmount_rejectsRatherThanRounding() throws Exception {
        var response = paidResponse("15.999", "TRADE_SUCCESS");
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradeQueryRequest.class)))
                                        .thenReturn(response))) {
            assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void query_unknownTradeState_rejectsRatherThanCrediting() throws Exception {
        var response = paidResponse("15.99", "FUTURE_SUCCESS_STATE");
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradeQueryRequest.class)))
                                        .thenReturn(response))) {
            assertThatThrownBy(() -> service.query(config, order)).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void query_paidResponseMissingTime_doesNotInventPaymentTime() throws Exception {
        var response = paidResponse("15.99", "TRADE_SUCCESS");
        response.setSendPayDate(null);
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradeQueryRequest.class)))
                                        .thenReturn(response))) {
            assertThat(service.query(config, order).paidAt()).isNull();
        }
    }

    @Test
    void close_businessFailure_doesNotTreatOrderAsClosed() throws Exception {
        var response = new AlipayTradeCloseResponse();
        response.setCode("40004");
        response.setSubCode("ACQ.TRADE_STATUS_ERROR");
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradeCloseRequest.class)))
                                        .thenReturn(response))) {
            assertThatThrownBy(() -> service.close(config, order)).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void close_responseForAnotherOrder_rejects() throws Exception {
        var response = new AlipayTradeCloseResponse();
        response.setCode("10000");
        response.setOutTradeNo("another-order");
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradeCloseRequest.class)))
                                        .thenReturn(response))) {
            assertThatThrownBy(() -> service.close(config, order)).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void create_sdkFailure_exposesSafeErrorWithoutCredentials() throws Exception {
        try (var clients =
                mockConstruction(
                        DefaultAlipayClient.class,
                        (client, context) ->
                                when(client.execute(any(AlipayTradePrecreateRequest.class)))
                                        .thenThrow(
                                                new AlipayApiException(
                                                        "CONNECT", "upstream-secret-detail")))) {
            assertThatThrownBy(() -> service.create(config, order))
                    .isInstanceOf(ApiException.class)
                    .hasMessageNotContaining("upstream-secret-detail");
        }
    }

    @Test
    void validate_untrustedGateway_rejectsBeforeConstructingClient() {
        var invalid =
                new AlipayConfigDTO(
                        1,
                        true,
                        config.appId(),
                        config.sellerId(),
                        "https://example.com/gateway.do",
                        config.notifyUrl(),
                        config.appPrivateKey(),
                        config.alipayPublicKey());
        try (var clients = mockConstruction(DefaultAlipayClient.class)) {
            assertThatThrownBy(() -> service.validate(invalid)).isInstanceOf(ApiException.class);
            assertThat(clients.constructed()).isEmpty();
        }
    }

    private AlipayTradeQueryResponse paidResponse(String amount, String state) {
        var response = new AlipayTradeQueryResponse();
        response.setCode("10000");
        response.setOutTradeNo(order.id());
        response.setTradeNo("transaction-123");
        response.setTradeStatus(state);
        response.setTotalAmount(amount);
        response.setTransCurrency("CNY");
        response.setSendPayDate(Date.from(Instant.parse("2026-09-12T02:00:00Z")));
        return response;
    }

    private AlipayConfigDTO configuration() {
        try {
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            var pair = generator.generateKeyPair();
            return new AlipayConfigDTO(
                    1,
                    true,
                    "2026000000000001",
                    "2088000000000001",
                    "https://openapi.alipay.com/gateway.do",
                    "https://pay.example.com/api/v1/payments/alipay/notify",
                    Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()),
                    Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()));
        } catch (java.security.GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }
}
