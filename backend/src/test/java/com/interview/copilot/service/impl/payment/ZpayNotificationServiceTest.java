package com.interview.copilot.service.impl.payment;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.payment.ZpayConfigService;
import com.interview.copilot.service.payment.ZpayPaymentService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 验证支付通知追踪日志与敏感信息隔离。
 */
class ZpayNotificationServiceTest {
    private final PaymentOrderMapper orders = mock(PaymentOrderMapper.class);
    private final ZpayPaymentService payment = mock(ZpayPaymentService.class);
    private final PaymentFulfillmentService fulfillment = mock(PaymentFulfillmentService.class);
    private final ZpayNotificationServiceImpl service = new ZpayNotificationServiceImpl(
            orders, mock(ZpayConfigService.class), payment, fulfillment);
    private final Logger logger = (Logger) LoggerFactory.getLogger(ZpayNotificationServiceImpl.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @BeforeEach
    void setUp() {
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(logs);
        logs.stop();
    }

    @Test
    void notify_success_logsStagesAndCreditsVerifiedResult() {
        prepare();
        var result = new PaymentResultDTO("123", "pid", "alipay", "456", "SUCCESS", "CNY", 120, null, "zpay");
        when(payment.notification(any(), any())).thenReturn(result);
        when(payment.query(any(), any())).thenReturn(result);

        service.notify(Map.of("out_trade_no", List.of("123"), "sign", List.of("secret-signature")));

        verify(fulfillment).credit(result);
        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage)
                .anyMatch(value -> value.contains("received"))
                .anyMatch(value -> value.contains("verified; stage query"))
                .anyMatch(value -> value.contains("fulfillment completed"));
        assertThat(logs.list).allSatisfy(event -> assertThat(event.getFormattedMessage()).doesNotContain("secret-signature"));
    }

    @Test
    void notify_verificationFailure_logsReceiptWithoutSensitiveException() {
        prepare();
        var failure = new IllegalStateException("key=merchant-secret&sign=secret-signature");
        when(payment.notification(any(), any())).thenThrow(failure);

        assertThatThrownBy(() -> service.notify(Map.of("out_trade_no", List.of("123"))))
                .isSameAs(failure);

        verifyNoInteractions(fulfillment);
        assertThat(logs.list).anySatisfy(event -> assertThat(event.getFormattedMessage()).contains("notification failed", "receipt"));
        assertThat(logs.list).allSatisfy(event -> {
            assertThat(event.getFormattedMessage()).doesNotContain("merchant-secret", "secret-signature");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    private void prepare() {
        var order = mock(PaymentOrderEntity.class);
        when(order.id()).thenReturn("123");
        when(order.paymentMethod()).thenReturn("zpay");
        when(order.totalCents()).thenReturn(120);
        when(order.expiresAt()).thenReturn(java.time.LocalDateTime.of(2026, 9, 14, 18, 0));
        when(orders.find("123")).thenReturn(order);
    }
}
