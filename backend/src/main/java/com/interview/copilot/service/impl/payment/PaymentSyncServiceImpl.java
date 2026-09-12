package com.interview.copilot.service.impl.payment;

import com.interview.copilot.converter.payment.PaymentConverter;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.payment.PaymentProviderService;
import com.interview.copilot.service.payment.PaymentSyncService;
import com.interview.copilot.util.ServerTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;

@Service
public class PaymentSyncServiceImpl implements PaymentSyncService {
    private static final Logger LOG = LoggerFactory.getLogger(PaymentSyncServiceImpl.class);
    private final PaymentOrderMapper orders;
    private final PaymentProviderService providers;
    private final PaymentFulfillmentService fulfillment;
    private final Clock clock;

    public PaymentSyncServiceImpl(
            PaymentOrderMapper orders,
            PaymentProviderService providers,
            PaymentFulfillmentService fulfillment,
            Clock clock) {
        this.orders = orders;
        this.providers = providers;
        this.fulfillment = fulfillment;
        this.clock = clock;
    }

    public void sync(String orderId) {
        var now = ServerTime.now(clock);
        if (orders.claimQuery(orderId, now, now.minusSeconds(3)) == 0) return;
        var order = orders.find(orderId);
        var request = PaymentConverter.orderDTO(order);
        var result = providers.query(order.paymentMethod(), order.configVersion(), request);
        providers.validateIdentity(order.paymentMethod(), order.configVersion(), result);
        if (!order.id().equals(result.orderId())) throw PaymentErrors.invalid("支付查询结果与当前订单不匹配");
        if ("SUCCESS".equals(result.state())) {
            fulfillment.credit(result);
            return;
        }
        if ("CLOSED".equals(result.state()) || "REVOKED".equals(result.state())) {
            orders.close(orderId);
            return;
        }
        if (!order.expiresAt().isAfter(now)) {
            if (!"NOTFOUND".equals(result.state()))
                providers.close(order.paymentMethod(), order.configVersion(), request);
            orders.close(orderId);
            return;
        }
        // Alipay may not create a queryable trade until the buyer scans the existing QR code.
        if ("alipay".equals(order.paymentMethod()) && order.codeUrl() != null) return;
        if ("NOTFOUND".equals(result.state())
                || ("NOTPAY".equals(result.state()) && order.codeUrl() == null))
            orders.qr(
                    orderId,
                    providers.create(order.paymentMethod(), order.configVersion(), request));
    }

    public void cancel(String orderId) {
        var order = orders.find(orderId);
        if (!"creating".equals(order.status()) && !"pending".equals(order.status())) return;
        var request = PaymentConverter.orderDTO(order);
        var result = providers.query(order.paymentMethod(), order.configVersion(), request);
        providers.validateIdentity(order.paymentMethod(), order.configVersion(), result);
        if (!orderId.equals(result.orderId())) throw PaymentErrors.invalid("支付查询结果与当前订单不匹配");
        if ("SUCCESS".equals(result.state())) {
            fulfillment.credit(result);
            return;
        }
        providers.close(order.paymentMethod(), order.configVersion(), request);
        orders.close(orderId);
    }

    public void notify(String body, PaymentHeadersDTO headers) {
        validateNotification(body, headers);
        PaymentResultDTO result = providers.wechatNotification(body, headers);
        fulfillment.credit(result);
        orders.notification(result.orderId(), digest(body));
    }

    public void reconcile() {
        for (String id : orders.pending(ServerTime.now(clock).minusSeconds(30))) {
            try {
                sync(id);
            } catch (RuntimeException error) {
                // Continue other orders; pending state stays durable for the next retry.
                LOG.error(
                        "Payment reconciliation failed for order {}, type {}",
                        id,
                        error.getClass().getSimpleName());
            }
        }
    }

    private String digest(String body) {
        try {
            var bytes =
                    MessageDigest.getInstance("SHA-256")
                            .digest(body.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private void validateNotification(String body, PaymentHeadersDTO h) {
        if (body == null || body.length() > 65536) throw PaymentErrors.invalid("支付通知格式错误");
        for (String value : List.of(h.serial(), h.nonce(), h.timestamp(), h.signature()))
            if (value.isBlank() || value.length() > 1024) throw PaymentErrors.invalid("支付通知请求头错误");
        try {
            long timestamp = Long.parseLong(h.timestamp());
            long now = clock.instant().getEpochSecond();
            if (timestamp < now - 300 || timestamp > now + 300)
                throw PaymentErrors.invalid("支付通知时间无效");
        } catch (NumberFormatException error) {
            throw PaymentErrors.invalid("支付通知时间格式错误");
        }
    }
}
