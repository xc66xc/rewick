package com.interview.copilot.dto.payment;

public record PaymentConfigDTO(
        long version,
        boolean enabled,
        String mchId,
        String appId,
        String merchantSerial,
        String wechatPublicKeyId,
        String notifyUrl,
        String merchantPrivateKey,
        String apiV3Key,
        String wechatPublicKey) {}
