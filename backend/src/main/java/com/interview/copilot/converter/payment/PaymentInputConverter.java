package com.interview.copilot.converter.payment;

import com.interview.copilot.dto.payment.ManualRefundDTO;
import com.interview.copilot.dto.payment.PackageInputDTO;
import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.request.payment.ManualRefundRequest;
import com.interview.copilot.request.payment.PackageRequest;
import com.interview.copilot.request.payment.PaymentConfigRequest;

public final class PaymentInputConverter {
    private PaymentInputConverter() {}

    public static PackageInputDTO packageDTO(PackageRequest p) {
        return new PackageInputDTO(
                p.version(),
                p.name(),
                p.description() == null ? "" : p.description(),
                p.durationSeconds(),
                p.originalPriceCents(),
                p.discountBps(),
                p.sortOrder(),
                p.enabled());
    }

    public static PaymentConfigDTO configDTO(PaymentConfigRequest p) {
        return new PaymentConfigDTO(
                p.version(),
                p.enabled(),
                p.mchId(),
                p.appId(),
                p.merchantSerial(),
                p.wechatPublicKeyId(),
                p.notifyUrl(),
                p.merchantPrivateKey(),
                p.apiV3Key(),
                p.wechatPublicKey());
    }

    public static ManualRefundDTO refundDTO(ManualRefundRequest p) {
        return new ManualRefundDTO(
                p.requestId().toString(),
                p.refundCents(),
                p.deductSeconds(),
                p.reference(),
                p.reason());
    }
}
