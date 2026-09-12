package com.interview.copilot.job.wallet;

import com.interview.copilot.service.wallet.WalletExpiryService;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class WalletExpiryJob {
    private final WalletExpiryService service;

    public WalletExpiryJob(WalletExpiryService service) {
        this.service = service;
    }

    @Scheduled(fixedDelay = 1000)
    public void expire() {
        service.expire();
    }
}
