package com.interview.copilot.response.payment;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 支付配置
 */
public record ZpayConfigResponse(
        long version,
        boolean enabled,
        boolean configured,
        String pid,
        String paymentType,
        String gatewayUrl,
        String queryUrl,
        String notifyUrl,
        String returnUrl,
        String cid,
        boolean hasMerchantKey) {}

