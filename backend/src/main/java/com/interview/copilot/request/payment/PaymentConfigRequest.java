package com.interview.copilot.request.payment;

import jakarta.validation.constraints.Size;

public record PaymentConfigRequest(
        long version,
        boolean enabled,
        @Size(max = 64) String mchId,
        @Size(max = 64) String appId,
        @Size(max = 128) String merchantSerial,
        @Size(max = 128) String wechatPublicKeyId,
        @Size(max = 1000) String notifyUrl,
        @Size(max = 16000) String merchantPrivateKey,
        @Size(max = 1000) String apiV3Key,
        @Size(max = 16000) String wechatPublicKey) {}
