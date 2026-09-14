package com.interview.copilot.request.payment;

import jakarta.validation.constraints.Size;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 支付配置
 */
public record ZpayConfigRequest(
        long version,
        boolean enabled,
        @Size(max = 64) String pid,
        @Size(max = 16) String paymentType,
        @Size(max = 1000) String gatewayUrl,
        @Size(max = 1000) String queryUrl,
        @Size(max = 1000) String notifyUrl,
        @Size(max = 1000) String returnUrl,
        @Size(max = 64) String cid,
        @Size(max = 2000) String merchantKey) {}

