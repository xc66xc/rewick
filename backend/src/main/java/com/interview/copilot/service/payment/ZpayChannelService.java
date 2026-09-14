package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 独立支付渠道处理。
 */
public interface ZpayChannelService {
    boolean available();
    long activeVersion();
    String create(long version, PaymentOrderDTO order);
    PaymentResultDTO query(long version, PaymentOrderDTO order);
    void validateIdentity(long version, PaymentResultDTO result);
}
