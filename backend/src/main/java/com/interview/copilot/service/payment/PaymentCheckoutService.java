package com.interview.copilot.service.payment;

import com.interview.copilot.response.payment.PaymentCheckoutResponse;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 浏览器支付收银台处理。
 */
public interface PaymentCheckoutService {
    PaymentCheckoutResponse issue(long userId, String orderId);

    String confirm(String ticket);

    String submit(String ticket);

    void cleanup();
}
