package com.interview.copilot.service.impl.payment;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.payment.PaymentConfigService;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.payment.WechatPaymentService;
import com.interview.copilot.util.ServerTime;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

class PaymentSyncServiceTest {
    private final Clock clock = Clock.fixed(Instant.parse("2026-09-12T00:00:00Z"), ZoneOffset.UTC);
    private final PaymentOrderMapper orders = mock(PaymentOrderMapper.class);
    private final PaymentConfigService configs = mock(PaymentConfigService.class);
    private final WechatPaymentService wechat = mock(WechatPaymentService.class);
    private final PaymentFulfillmentService fulfillment = mock(PaymentFulfillmentService.class);
    private final PaymentSyncServiceImpl service =
            new PaymentSyncServiceImpl(orders, configs, wechat, fulfillment, clock);
    private final PaymentConfigDTO config =
            new PaymentConfigDTO(
                    1,
                    true,
                    "merchant",
                    "app",
                    "serial",
                    "pub",
                    "https://example.com/api/v1/payments/wechat/notify",
                    "private",
                    "key",
                    "public");

    @Test
    void sync_resultBelongsToAnotherOrder_rejectsWithoutCredit() {
        prepare(false);
        when(wechat.query(eq(config), any())).thenReturn(result("different", "SUCCESS"));

        assertThatThrownBy(() -> service.sync("order")).isInstanceOf(ApiException.class);

        verifyNoInteractions(fulfillment);
        verify(orders, never()).close(any());
    }

    @Test
    void sync_closedResultBelongsToAnotherMerchant_doesNotCloseLocalOrder() {
        prepare(false);
        when(wechat.query(eq(config), any()))
                .thenReturn(
                        new PaymentResultDTO(
                                "order", "wrong", "app", null, "CLOSED", null, 0, null));

        assertThatThrownBy(() -> service.sync("order")).isInstanceOf(ApiException.class);

        verify(orders, never()).close(any());
    }

    @Test
    void sync_expiredAndCloseFails_keepsPendingForReconciliation() {
        prepare(true);
        when(wechat.query(eq(config), any())).thenReturn(result("order", "NOTPAY"));
        doThrow(new IllegalStateException("timeout")).when(wechat).close(eq(config), any());

        assertThatThrownBy(() -> service.sync("order")).isInstanceOf(IllegalStateException.class);

        verify(orders, never()).close(any());
    }

    @Test
    void sync_expiredButPaid_creditsInsteadOfClosing() {
        prepare(true);
        var paid = result("order", "SUCCESS");
        when(wechat.query(eq(config), any())).thenReturn(paid);

        service.sync("order");

        verify(fulfillment).credit(paid);
        verify(wechat, never()).close(any(), any());
    }

    @Test
    void notify_staleTimestamp_rejectsBeforeConfigLookup() {
        var h =
                new PaymentHeadersDTO(
                        "serial",
                        "nonce",
                        Long.toString(clock.instant().getEpochSecond() - 301),
                        "signature");

        assertThatThrownBy(() -> service.notify("{}", h)).isInstanceOf(ApiException.class);

        verifyNoInteractions(configs, wechat, fulfillment);
    }

    @Test
    void reconcile_oneFailure_doesNotBlockAnotherOrder() {
        when(orders.pending(any())).thenReturn(List.of("failed", "order"));
        when(orders.claimQuery(eq("failed"), any(), any()))
                .thenThrow(new IllegalStateException("database retry"));
        prepare(false);
        var paid = result("order", "SUCCESS");
        when(wechat.query(eq(config), any())).thenReturn(paid);

        service.reconcile();

        verify(fulfillment).credit(paid);
    }

    private void prepare(boolean expired) {
        var now = ServerTime.now(clock);
        var order =
                new PaymentOrderEntity(
                        1,
                        "order",
                        1,
                        "User",
                        1,
                        1,
                        "Package",
                        3600,
                        100,
                        1,
                        "pending",
                        false,
                        "weixin://qr",
                        null,
                        now.minusMinutes(20),
                        expired ? now.minusSeconds(1) : now.plusMinutes(10),
                        null,
                        0,
                        0);
        when(orders.claimQuery(eq("order"), any(), any())).thenReturn(1);
        when(orders.find("order")).thenReturn(order);
        when(configs.forOrder(1)).thenReturn(config);
    }

    private PaymentResultDTO result(String orderId, String state) {
        return new PaymentResultDTO(
                orderId, "merchant", "app", "transaction", state, "CNY", 100, clock.instant());
    }
}
