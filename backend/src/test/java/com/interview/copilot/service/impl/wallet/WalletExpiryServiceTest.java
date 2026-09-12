package com.interview.copilot.service.impl.wallet;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.util.ServerTime;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

class WalletExpiryServiceTest {
    @Test
    void expire_oneWalletFails_continuesSettlingOtherUsers() {
        WalletMapper mapper = mock(WalletMapper.class);
        WalletService wallets = mock(WalletService.class);
        Clock clock = Clock.fixed(Instant.parse("2026-09-12T00:00:00Z"), ServerTime.ZONE);
        when(mapper.expiredUsers(ServerTime.now(clock))).thenReturn(List.of(7L, 8L));
        doThrow(new IllegalStateException("fixture failure")).when(wallets).state(7L);

        new WalletExpiryServiceImpl(mapper, wallets, clock).expire();

        var order = inOrder(wallets);
        order.verify(wallets).state(7L);
        order.verify(wallets).state(8L);
    }
}
