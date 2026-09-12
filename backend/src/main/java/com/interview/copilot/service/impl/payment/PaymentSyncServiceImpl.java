package com.interview.copilot.service.impl.payment;

import com.interview.copilot.converter.payment.PaymentConverter;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.payment.PaymentConfigService;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.payment.PaymentSyncService;
import com.interview.copilot.service.payment.WechatPaymentService;
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
    private final PaymentConfigService configs;
    private final WechatPaymentService wechat;
    private final PaymentFulfillmentService fulfillment;
    private final Clock clock;

    public PaymentSyncServiceImpl(
            PaymentOrderMapper orders,
            PaymentConfigService configs,
            WechatPaymentService wechat,
            PaymentFulfillmentService fulfillment,
            Clock clock) {
        this.orders = orders;
        this.configs = configs;
        this.wechat = wechat;
        this.fulfillment = fulfillment;
        this.clock = clock;
    }

    public void sync(String orderId) {
        var now = ServerTime.now(clock);
        if (orders.claimQuery(orderId, now, now.minusSeconds(3)) == 0) return;
        var order = orders.find(orderId);
        var config = configs.forOrder(order.configVersion());
        var request = PaymentConverter.orderDTO(order);
        var result = wechat.query(config, request);
        if (!order.id().equals(result.orderId())
                || !config.mchId().equals(result.mchId())
                || !config.appId().equals(result.appId()))
            throw PaymentErrors.invalid("微信查询结果与当前订单不匹配");
        if ("SUCCESS".equals(result.state())) {
            fulfillment.credit(result);
            return;
        }
        if ("CLOSED".equals(result.state()) || "REVOKED".equals(result.state())) {
            orders.close(orderId);
            return;
        }
        if (!order.expiresAt().isAfter(now)) {
            if (!"NOTFOUND".equals(result.state())) wechat.close(config, request);
            orders.close(orderId);
            return;
        }
        if ("NOTFOUND".equals(result.state())
                || ("NOTPAY".equals(result.state()) && order.codeUrl() == null))
            orders.qr(orderId, wechat.create(config, request));
    }

    public void notify(String body, PaymentHeadersDTO headers) {
        validateNotification(body, headers);
        PaymentResultDTO result = parse(body, headers);
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

    private PaymentResultDTO parse(String body, PaymentHeadersDTO headers) {
        for (var config : configs.notificationConfigs(headers.serial())) {
            try {
                return wechat.notification(config, body, headers);
            } catch (ApiException error) {
                if (!"PAYMENT_INVALID".equals(error.code())) throw error;
            }
        }
        throw PaymentErrors.invalid("支付通知验签或解密失败");
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
