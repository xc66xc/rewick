package com.interview.copilot.job.payment;

import com.interview.copilot.service.payment.PaymentCheckoutService;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 浏览器支付收银台处理。
 */
@Component
public class PaymentCheckoutCleanupJob {
    private final PaymentCheckoutService checkout;

    public PaymentCheckoutCleanupJob(PaymentCheckoutService checkout) {
        this.checkout = checkout;
    }

    @Scheduled(initialDelay = 3600000, fixedDelay = 3600000)
    public void run() {
        checkout.cleanup();
    }
}
