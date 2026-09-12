package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.response.payment.PaymentConfigResponse;

import java.util.List;

public interface PaymentConfigService {
    PaymentConfigResponse read();

    PaymentConfigResponse save(long actorId, PaymentConfigDTO input);

    PaymentConfigDTO forOrder(long version);

    List<PaymentConfigDTO> notificationConfigs(String serial);

    boolean available();
}
