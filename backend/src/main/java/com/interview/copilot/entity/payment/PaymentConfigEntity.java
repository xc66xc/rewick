package com.interview.copilot.entity.payment;

public record PaymentConfigEntity(
        long id,
        boolean enabled,
        String mchId,
        String appId,
        String merchantSerial,
        String wechatPublicKeyId,
        String notifyUrl,
        String merchantPrivateKey,
        String apiV3Key,
        String wechatPublicKey) {}
