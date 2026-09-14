package com.interview.copilot.converter.payment;

import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.request.payment.ZpayConfigRequest;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 支付配置
 */
public final class ZpayConfigConverter {
    private ZpayConfigConverter() {}

    public static ZpayConfigDTO input(ZpayConfigRequest value) {
        return new ZpayConfigDTO(value.version(), value.enabled(), value.pid(), value.paymentType(),
                value.gatewayUrl(), value.queryUrl(), value.notifyUrl(), value.returnUrl(),
                value.cid(), value.merchantKey());
    }
}

