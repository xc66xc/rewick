package com.interview.copilot.service.impl.wallet;

import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.service.wallet.WalletExpiryService;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.util.ServerTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;

@Service
public class WalletExpiryServiceImpl implements WalletExpiryService {
    private static final Logger LOG = LoggerFactory.getLogger(WalletExpiryServiceImpl.class);
    private final WalletMapper repository;
    private final WalletService service;
    private final Clock clock;

    public WalletExpiryServiceImpl(WalletMapper repository, WalletService service, Clock clock) {
        this.repository = repository;
        this.service = service;
        this.clock = clock;
    }

    @Override
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
