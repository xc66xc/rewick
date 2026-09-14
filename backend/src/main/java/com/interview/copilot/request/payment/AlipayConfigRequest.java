package com.interview.copilot.request.payment;

import jakarta.validation.constraints.Size;

public record AlipayConfigRequest(
        long version,
        boolean enabled,
        @Size(max = 64) String appId,
        @Size(max = 64) String sellerId,
        @Size(max = 1000) String gatewayUrl,
        @Size(max = 1000) String notifyUrl,
        @Size(max = 1000) String returnUrl,
        @Size(max = 16000) String appPrivateKey,
        @Size(max = 16000) String alipayPublicKey) {}
