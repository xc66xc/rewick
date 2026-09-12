package com.interview.copilot.entity.payment;

public record AlipayConfigEntity(
        long id,
        boolean enabled,
        String appId,
        String sellerId,
        String gatewayUrl,
        String notifyUrl,
        String appPrivateKey,
        String alipayPublicKey) {}
