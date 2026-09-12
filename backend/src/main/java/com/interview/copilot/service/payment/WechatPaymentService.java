package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;

public interface WechatPaymentService {
    void validate(PaymentConfigDTO config);

    String create(PaymentConfigDTO config, PaymentOrderDTO order);

    PaymentResultDTO query(PaymentConfigDTO config, PaymentOrderDTO order);

    void close(PaymentConfigDTO config, PaymentOrderDTO order);

    PaymentResultDTO notification(PaymentConfigDTO config, String body, PaymentHeadersDTO headers);
}
