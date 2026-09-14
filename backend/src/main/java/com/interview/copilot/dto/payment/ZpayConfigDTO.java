package com.interview.copilot.dto.payment;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 支付配置
 */
public record ZpayConfigDTO(
        long version,
        boolean enabled,
        String pid,
        String paymentType,
        String gatewayUrl,
        String queryUrl,
        String notifyUrl,
        String returnUrl,
        String cid,
        String merchantKey) {}

