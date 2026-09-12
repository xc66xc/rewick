package com.interview.copilot.service.impl.payment;

import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.service.payment.AlipayConfigService;
import com.interview.copilot.service.payment.AlipayNotificationService;
import com.interview.copilot.service.payment.AlipayPaymentService;
import com.interview.copilot.service.payment.PaymentFulfillmentService;

import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AlipayNotificationServiceImpl implements AlipayNotificationService {
    private final PaymentOrderMapper orders;
    private final AlipayConfigService configs;
    private final AlipayPaymentService alipay;
    private final PaymentFulfillmentService fulfillment;

    public AlipayNotificationServiceImpl(
            PaymentOrderMapper orders,
            AlipayConfigService configs,
            AlipayPaymentService alipay,
            PaymentFulfillmentService fulfillment) {
        this.orders = orders;
        this.configs = configs;
        this.alipay = alipay;
        this.fulfillment = fulfillment;
    }

    public void notify(Map<String, List<String>> parameters) {
        var p = singleValues(parameters);
        var order = orders.find(p.get("out_trade_no"));
        if (order == null || !"alipay".equals(order.paymentMethod()))
            throw PaymentErrors.invalid("支付通知订单无效");
        var result = alipay.notification(configs.forOrder(order.configVersion()), p);
        if (!order.id().equals(result.orderId()) || order.totalCents() != result.totalCents())
            throw PaymentErrors.invalid("支付通知与订单金额不匹配");
        if ("SUCCESS".equals(result.state())) fulfillment.credit(result);
        else if ("CLOSED".equals(result.state())) orders.close(order.id());
        else throw PaymentErrors.invalid("支付宝通知交易状态无效");
    }

    private Map<String, String> singleValues(Map<String, List<String>> parameters) {
        if (parameters == null || parameters.size() > 100) throw PaymentErrors.invalid("支付通知格式错误");
        var values = new HashMap<String, String>();
        int length = 0;
        for (var item : parameters.entrySet()) {
            if (item.getValue() == null || item.getValue().size() != 1)
                throw PaymentErrors.invalid("支付通知参数重复");
            String value = item.getValue().getFirst();
            if (value == null) throw PaymentErrors.invalid("支付通知参数缺失");
            length += item.getKey().length() + value.length();
            if (length > 65536) throw PaymentErrors.invalid("支付通知过大");
            values.put(item.getKey(), value);
        }
        return values;
    }
}
