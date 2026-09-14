package com.interview.copilot.service.impl.payment;

import com.interview.copilot.converter.payment.PaymentConverter;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.payment.ZpayConfigService;
import com.interview.copilot.service.payment.ZpayNotificationService;
import com.interview.copilot.service.payment.ZpayPaymentService;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 独立支付渠道处理。
 */
@Service
public class ZpayNotificationServiceImpl implements ZpayNotificationService {
    private static final Logger LOG = LoggerFactory.getLogger(ZpayNotificationServiceImpl.class);
    private final PaymentOrderMapper orders;
    private final ZpayConfigService configs;
    private final ZpayPaymentService payment;
    private final PaymentFulfillmentService fulfillment;

    public ZpayNotificationServiceImpl(PaymentOrderMapper orders, ZpayConfigService configs,
            ZpayPaymentService payment, PaymentFulfillmentService fulfillment) {
        this.orders = orders;
        this.configs = configs;
        this.payment = payment;
        this.fulfillment = fulfillment;
    }

    public void notify(Map<String, List<String>> parameters) {
        String receipt = UUID.randomUUID().toString();
        long started = System.nanoTime();
        LOG.info("ZPAY notification received, receipt {}", receipt);
        try {
            process(parameters, receipt);
            LOG.info("ZPAY notification completed, receipt {}, elapsedMs {}", receipt,
                    TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        } catch (RuntimeException error) {
            // Supplier exceptions and request parameters may contain secrets; log neither.
            LOG.warn("ZPAY notification failed, receipt {}, failureType {}, elapsedMs {}", receipt,
                    error.getClass().getSimpleName(),
                    TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
            throw error;
        }
    }

    private void process(Map<String, List<String>> parameters, String receipt) {
        LOG.info("ZPAY notification stage parameters, receipt {}", receipt);
        var values = singleValues(parameters);
        var order = orders.find(values.get("out_trade_no"));
        if (order == null || !"zpay".equals(order.paymentMethod()))
            throw PaymentErrors.invalid("支付通知订单无效");
        LOG.info("ZPAY notification stage verification, receipt {}, order {}", receipt, order.id());
        var config = configs.forOrder(order.configVersion());
        var notification = payment.notification(config, values);
        if (!order.id().equals(notification.orderId()) || order.totalCents() != notification.totalCents())
            throw PaymentErrors.invalid("支付通知与订单金额不匹配");
        LOG.info("ZPAY notification verified; stage query, receipt {}, order {}", receipt, order.id());
        // The notification has no payment timestamp. Query the provider before fulfilling.
        var confirmed = payment.query(config, PaymentConverter.orderDTO(order));
        if (!"SUCCESS".equals(confirmed.state())
                || !notification.transactionId().equals(confirmed.transactionId()))
            throw PaymentErrors.invalid("支付结果尚未核实，请重试通知");
        LOG.info("ZPAY notification query confirmed; stage fulfillment, receipt {}, order {}", receipt, order.id());
        fulfillment.credit(confirmed);
        LOG.info("ZPAY notification fulfillment completed, receipt {}, order {}", receipt, order.id());
    }

    private Map<String, String> singleValues(Map<String, List<String>> parameters) {
        if (parameters == null || parameters.size() > 30) throw PaymentErrors.invalid("支付通知格式错误");
        var values = new HashMap<String, String>();
        int length = 0;
        for (var item : parameters.entrySet()) {
            if (item.getValue() == null || item.getValue().size() != 1)
                throw PaymentErrors.invalid("支付通知参数重复");
            String value = item.getValue().getFirst();
            if (value == null) throw PaymentErrors.invalid("支付通知参数缺失");
            length += item.getKey().length() + value.length();
            if (length > 8192) throw PaymentErrors.invalid("支付通知过大");
            values.put(item.getKey(), value);
        }
        return values;
    }
}
