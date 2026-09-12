package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.AlipayConfigDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;

import java.util.Map;

public interface AlipayPaymentService {
    void validate(AlipayConfigDTO config);

    String create(AlipayConfigDTO config, PaymentOrderDTO order);

    PaymentResultDTO query(AlipayConfigDTO config, PaymentOrderDTO order);

    void close(AlipayConfigDTO config, PaymentOrderDTO order);

    PaymentResultDTO notification(AlipayConfigDTO config, Map<String, String> parameters);
}
