package com.interview.copilot.job.payment;

import com.interview.copilot.service.payment.PaymentSyncService;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PaymentReconciliationJob {
    private final PaymentSyncService service;

    public PaymentReconciliationJob(PaymentSyncService service) {
        this.service = service;
    }

    @Scheduled(fixedDelay = 30000, initialDelay = 30000)
    public void run() {
        service.reconcile();
    }
}
