package com.interview.copilot.service.impl.payment;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.payment.PaymentProviderService;
import com.interview.copilot.util.ServerTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

class AlipayPendingOrderSyncTest {
    private final Clock clock = Clock.fixed(Instant.parse("2026-09-12T00:00:00Z"), ZoneOffset.UTC);
    private final PaymentOrderMapper orders = mock(PaymentOrderMapper.class);
    private final PaymentProviderService providers = mock(PaymentProviderService.class);
    private final PaymentFulfillmentService fulfillment = mock(PaymentFulfillmentService.class);
    private final PaymentSyncServiceImpl service = new PaymentSyncServiceImpl(orders, providers, fulfillment, clock);

    @ParameterizedTest
    @ValueSource(strings = {"NOTFOUND", "NOTPAY"})
    void sync_existingQrBeforePayment_doesNotPrecreateAgain(String state) {
        prepare("https://qr.alipay.com/test", 600, state);

        service.sync("order");

        verify(providers, never()).create(any(), eq(1L), any());
        verify(orders, never()).close(any());
        verify(fulfillment, never()).credit(any());
    }

    @Test
    void sync_missingQrAndTrade_recoversPrecreation() {
        prepare(null, 600, "NOTFOUND");
        when(providers.create(eq("alipay"), eq(1L), any())).thenReturn("https://qr.alipay.com/new");

        service.sync("order");

        verify(orders).qr("order", "https://qr.alipay.com/new");
    }

    @Test
    void sync_existingQrExpiredWithoutTrade_closesLocally() {
        prepare("https://qr.alipay.com/test", -1, "NOTFOUND");

        service.sync("order");

        verify(orders).close("order");
        verify(providers, never()).create(any(), eq(1L), any());
    }

    private void prepare(String qr, int expiresIn, String state) {
        var now = ServerTime.now(clock);
        var order = new PaymentOrderEntity(1, "order", 1, "User", 1, 1, "Package",
                3600, 100, 1, qr == null ? "creating" : "pending", false, qr, null,
                now.minusSeconds(60), now.plusSeconds(expiresIn), null, 0, 0, "alipay");
        when(orders.claimQuery(eq("order"), any(), any())).thenReturn(1);
        when(orders.find("order")).thenReturn(order);
        when(providers.query(eq("alipay"), eq(1L), any())).thenReturn(
                new PaymentResultDTO("order", "merchant", "app", null, state, "CNY", 100, null, "alipay"));
    }
}
