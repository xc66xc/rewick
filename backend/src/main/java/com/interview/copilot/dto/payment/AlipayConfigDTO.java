package com.interview.copilot.dto.payment;

public record AlipayConfigDTO(
        long version,
        boolean enabled,
        String appId,
        String sellerId,
        String gatewayUrl,
        String notifyUrl,
        String returnUrl,
        String appPrivateKey,
        String alipayPublicKey) {}
