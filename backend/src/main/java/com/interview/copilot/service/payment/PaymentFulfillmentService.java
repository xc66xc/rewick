package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.ManualRefundDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;

public interface PaymentFulfillmentService {
    void credit(PaymentResultDTO result);

    void refund(long actorId, String orderId, ManualRefundDTO input);
}
