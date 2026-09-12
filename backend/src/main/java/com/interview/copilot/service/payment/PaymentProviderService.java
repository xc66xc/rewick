package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;

import java.util.List;

public interface PaymentProviderService {
    PaymentResultDTO wechatNotification(String body, PaymentHeadersDTO headers);

    List<String> availableMethods();

    long activeVersion(String paymentMethod);

    PaymentResultDTO query(String paymentMethod, long version, PaymentOrderDTO order);

    String create(String paymentMethod, long version, PaymentOrderDTO order);

    void close(String paymentMethod, long version, PaymentOrderDTO order);

    void validateIdentity(String paymentMethod, long version, PaymentResultDTO result);
}
