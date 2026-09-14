package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.response.payment.ZpayConfigResponse;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 支付配置
 */
public interface ZpayConfigService {
    ZpayConfigResponse read();
    ZpayConfigResponse save(long actorId, ZpayConfigDTO input);
    ZpayConfigDTO forOrder(long version);
    boolean available();
}

