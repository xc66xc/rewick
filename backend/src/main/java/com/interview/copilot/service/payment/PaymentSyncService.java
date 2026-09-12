package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.PaymentHeadersDTO;

public interface PaymentSyncService {
    void sync(String orderId);

    void notify(String body, PaymentHeadersDTO headers);

    void reconcile();
}
