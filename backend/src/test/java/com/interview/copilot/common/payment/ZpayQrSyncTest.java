package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentCheckoutMapper;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.impl.payment.PaymentSyncServiceImpl;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.payment.PaymentProviderService;
import com.interview.copilot.util.ServerTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 二维码下单的单次尝试与失败恢复测试。
 */
@ExtendWith(MockitoExtension.class)
class ZpayQrSyncTest {
    private static final String ID = "12345678901234567890123456789012";
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-14T10:00:00Z"), ZoneOffset.UTC);
    @Mock PaymentOrderMapper orders;
    @Mock PaymentProviderService providers;
    @Mock PaymentFulfillmentService fulfillment;
    @Mock PaymentCheckoutMapper tickets;
    private PaymentSyncServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new PaymentSyncServiceImpl(orders, providers, fulfillment, CLOCK, tickets);
        when(orders.claimQuery(eq(ID), any(), any())).thenReturn(1);
        when(orders.find(ID)).thenReturn(order());
    }

    @Test
    void sync_firstAttempt_createsQrWithPersistedClientIp() {
        when(orders.claimZpayCreate(ID)).thenReturn(1);
        when(orders.clientIp(ID)).thenReturn("203.0.113.9");
        when(providers.create(eq("zpay"), eq(3L), any())).thenReturn("https://qr.alipay.com/fixture");

        service.sync(ID);

        var request = ArgumentCaptor.forClass(PaymentOrderDTO.class);
        verify(providers).create(eq("zpay"), eq(3L), request.capture());
        assertThat(request.getValue().clientIp()).isEqualTo("203.0.113.9");
        verify(orders).qr(ID, "https://qr.alipay.com/fixture");
        verify(providers, never()).query(any(), any(Long.class), any());
    }

    @Test
    void sync_uncertainCreateFailure_queriesWithoutSubmittingAgain() {
        when(orders.claimZpayCreate(ID)).thenReturn(1, 0);
        when(orders.clientIp(ID)).thenReturn("203.0.113.9");
        when(providers.create(eq("zpay"), eq(3L), any())).thenThrow(PaymentErrors.upstream());
        when(providers.query(eq("zpay"), eq(3L), any())).thenReturn(notFound());

        assertThatThrownBy(() -> service.sync(ID)).isInstanceOf(RuntimeException.class);
        service.sync(ID);

        verify(providers).create(eq("zpay"), eq(3L), any());
        verify(providers).query(eq("zpay"), eq(3L), any());
        verify(orders, never()).qr(any(), any());
        verify(fulfillment, never()).credit(any());
    }

    @Test
    void sync_concurrentRecoveryWhileCreatePending_submitsOnlyOnce() throws Exception {
        var claimed = new AtomicBoolean();
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(orders.claimZpayCreate(ID)).thenAnswer(call -> claimed.compareAndSet(false, true) ? 1 : 0);
        when(orders.clientIp(ID)).thenReturn("203.0.113.9");
        when(providers.query(eq("zpay"), eq(3L), any())).thenReturn(notFound());
        when(providers.create(eq("zpay"), eq(3L), any())).thenAnswer(call -> {
            started.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Test release timed out");
            return "https://qr.alipay.com/fixture";
        });

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> service.sync(ID));
            try {
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                executor.submit(() -> service.sync(ID)).get(5, TimeUnit.SECONDS);
            } finally {
                release.countDown();
            }
            first.get(5, TimeUnit.SECONDS);
        }

        verify(providers).create(eq("zpay"), eq(3L), any());
        verify(orders).qr(ID, "https://qr.alipay.com/fixture");
        verify(fulfillment, never()).credit(any());
    }

    private PaymentResultDTO notFound() {
        return new PaymentResultDTO(ID, "12345", "alipay", "", "NOTFOUND", "CNY", 1, null, "zpay");
    }

    private PaymentOrderEntity order() {
        var now = ServerTime.now(CLOCK);
        return new PaymentOrderEntity(1, ID, 2, "User", 1, 1, "Package", 3600, 1, 3,
                "creating", false, null, null, now, now.plusMinutes(15), null, 0, 0, "zpay");
    }
}
