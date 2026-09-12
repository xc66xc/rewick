package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.ManualRefundDTO;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.response.payment.PaymentOrderResponse;

import java.util.List;

public interface PaymentOrderService {
    PaymentOrderResponse create(long userId, long packageId, long packageVersion, String requestId);

    PaymentOrderResponse read(Long userId, String id);

    List<PaymentOrderResponse> list(Long userId);

    PaymentOrderResponse refresh(Long userId, String id);

    PaymentOrderResponse refund(long actorId, String id, ManualRefundDTO input);

    void notify(String body, PaymentHeadersDTO headers);

    void reconcile();
}
