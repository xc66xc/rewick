package com.interview.copilot.converter.payment;

import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.entity.payment.TimePackageEntity;
import com.interview.copilot.response.payment.PaymentOrderResponse;
import com.interview.copilot.response.payment.TimePackageResponse;
import com.interview.copilot.util.ServerTime;

public final class PaymentConverter {
    private PaymentConverter() {}

    public static TimePackageResponse packageResponse(TimePackageEntity p) {
        return new TimePackageResponse(
                p.id(),
                p.version(),
                p.name(),
                p.description(),
                p.durationSeconds(),
                p.originalPriceCents(),
                p.discountBps(),
                p.priceCents(),
                p.sortOrder(),
                p.enabled());
    }

    public static PaymentOrderDTO orderDTO(PaymentOrderEntity p) {
        return new PaymentOrderDTO(
                p.id(),
                p.userId(),
                p.packageName(),
                p.durationSeconds(),
                p.totalCents(),
                ServerTime.instant(p.expiresAt()));
    }

    public static PaymentOrderResponse orderResponse(PaymentOrderEntity p, boolean includeQr) {
        return new PaymentOrderResponse(
                p.id(),
                p.userId(),
                p.displayName(),
                p.packageName(),
                p.durationSeconds(),
                p.totalCents(),
                p.status(),
                p.credited(),
                includeQr ? p.codeUrl() : null,
                ServerTime.instant(p.createdAt()),
                ServerTime.instant(p.expiresAt()),
                p.paidAt() == null ? null : ServerTime.instant(p.paidAt()),
                p.refundedCents(),
                p.deductedSeconds());
    }
}
