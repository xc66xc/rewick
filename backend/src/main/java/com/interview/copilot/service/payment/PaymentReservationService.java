package com.interview.copilot.service.payment;

import com.interview.copilot.response.payment.PaymentOrderResponse;

public interface PaymentReservationService {
    PaymentOrderResponse reserve(
            long userId,
            long packageId,
            long packageVersion,
            String requestId,
            String paymentMethod,
            String clientIp);
}
