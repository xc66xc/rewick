package com.interview.copilot.response.payment;

public record PaymentConfigResponse(
        long version,
        boolean enabled,
        boolean configured,
        String mchId,
        String appId,
        String merchantSerial,
        String wechatPublicKeyId,
        String notifyUrl,
        boolean hasMerchantPrivateKey,
        boolean hasApiV3Key,
        boolean hasWechatPublicKey) {}
