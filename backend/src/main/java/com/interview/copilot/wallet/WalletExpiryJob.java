package com.interview.copilot.wallet;

import java.time.Clock;
import com.interview.copilot.common.ServerTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class WalletExpiryJob {
    private static final Logger LOG=LoggerFactory.getLogger(WalletExpiryJob.class);
    private final WalletRepository repository;
    private final WalletService service;
    private final Clock clock;
    public WalletExpiryJob(WalletRepository repository,WalletService service,Clock clock) { this.repository=repository; this.service=service; this.clock=clock; }
    @Scheduled(fixedDelay=1000)
    public void expire() {
        for(long id:repository.expiredUsers(ServerTime.now(clock))) {
            try { service.state(id); }
            catch(RuntimeException error) { LOG.error("Unable to settle interview wallet for user {}",id,error); }
        }
    }
}
