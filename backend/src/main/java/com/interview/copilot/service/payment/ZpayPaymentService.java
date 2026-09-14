package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import java.util.Map;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 收银台、查单和支付通知协议。
 */
public interface ZpayPaymentService {
    String create(ZpayConfigDTO config, PaymentOrderDTO order);
    PaymentResultDTO query(ZpayConfigDTO config, PaymentOrderDTO order);
    PaymentResultDTO notification(ZpayConfigDTO config, Map<String, String> parameters);
}
