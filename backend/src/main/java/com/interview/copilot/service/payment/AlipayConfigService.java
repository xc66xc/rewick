package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.AlipayConfigDTO;
import com.interview.copilot.response.payment.AlipayConfigResponse;

public interface AlipayConfigService {
    AlipayConfigResponse read();

    AlipayConfigResponse save(long actorId, AlipayConfigDTO input);

    AlipayConfigDTO forOrder(long version);

    boolean available();
}
