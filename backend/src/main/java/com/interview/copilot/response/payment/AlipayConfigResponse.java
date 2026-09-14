package com.interview.copilot.response.payment;

public record AlipayConfigResponse(
        long version,
        boolean enabled,
        boolean configured,
        String appId,
        String sellerId,
        String gatewayUrl,
        String notifyUrl,
        String returnUrl,
        boolean hasAppPrivateKey,
        boolean hasAlipayPublicKey) {}
