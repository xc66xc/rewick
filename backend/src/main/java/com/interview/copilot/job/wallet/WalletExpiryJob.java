package com.interview.copilot.job.wallet;

import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.util.ServerTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;

@Component
public class WalletExpiryJob {
    private static final Logger LOG = LoggerFactory.getLogger(WalletExpiryJob.class);
    private final WalletMapper repository;
    private final WalletService service;
    private final Clock clock;

    public WalletExpiryJob(WalletMapper repository, WalletService service, Clock clock) {
        this.repository = repository;
        this.service = service;
        this.clock = clock;
    }

    @Scheduled(fixedDelay = 1000)
    public void expire() {
        for (long id : repository.expiredUsers(ServerTime.now(clock))) {
            try {
                service.state(id);
            } catch (RuntimeException error) {
                LOG.error("Unable to settle interview wallet for user {}", id, error);
            }
        }
    }
}
