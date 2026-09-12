package com.interview.copilot.converter.wallet;

import com.interview.copilot.dto.wallet.WalletAdjustment;
import com.interview.copilot.request.wallet.WalletAdjustmentRequest;

public final class WalletAdjustmentConverter {
    private WalletAdjustmentConverter() {}

    public static WalletAdjustment toDTO(WalletAdjustmentRequest input) {
        return new WalletAdjustment(
                input.requestId(), input.operation(), input.seconds(),
                input.expectedVersion(), input.reason());
    }
}
