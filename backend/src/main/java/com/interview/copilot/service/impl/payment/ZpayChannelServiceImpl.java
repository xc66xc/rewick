package com.interview.copilot.service.impl.payment;

import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.service.payment.ZpayChannelService;
import com.interview.copilot.service.payment.ZpayConfigService;
import com.interview.copilot.service.payment.ZpayPaymentService;
import org.springframework.stereotype.Service;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 独立支付渠道处理。
 */
@Service
public class ZpayChannelServiceImpl implements ZpayChannelService {
    private final ZpayConfigService configs;
    private final ZpayPaymentService payment;

    public ZpayChannelServiceImpl(ZpayConfigService configs, ZpayPaymentService payment) {
        this.configs = configs;
        this.payment = payment;
    }

    public boolean available() { return configs.available(); }

    public long activeVersion() {
        var config = configs.read();
        if (!config.enabled() || !config.configured()) throw PaymentErrors.unavailable();
        return config.version();
    }

    public String create(long version, PaymentOrderDTO order) {
        return payment.create(configs.forOrder(version), order);
    }

    public PaymentResultDTO query(long version, PaymentOrderDTO order) {
        return payment.query(configs.forOrder(version), order);
    }

    public void validateIdentity(long version, PaymentResultDTO result) {
        var config = configs.forOrder(version);
        if (!"zpay".equals(result.paymentMethod()) || !config.pid().equals(result.mchId())
                || !config.paymentType().equals(result.appId()))
            throw PaymentErrors.invalid("支付结果与订单渠道或商户不匹配");
    }
}
