package com.interview.copilot.service.wallet;

import com.interview.copilot.response.wallet.WalletResponse;

public interface WalletService {
    WalletResponse state(long userId);

    WalletResponse start(long userId, String requestId);

    WalletResponse heartbeat(long userId, String id);

    WalletResponse end(long userId, String id);

    String requireActive(long userId);

    void endCurrent(long userId);

    boolean isActive(long userId, String sessionId);
}
