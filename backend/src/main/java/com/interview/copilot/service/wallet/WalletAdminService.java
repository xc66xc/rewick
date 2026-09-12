package com.interview.copilot.service.wallet;

import com.interview.copilot.common.Page;
import com.interview.copilot.request.wallet.WalletAdjustmentRequest;
import com.interview.copilot.response.wallet.WalletResponse;
import com.interview.copilot.response.wallet.WalletTransactionResponse;
import com.interview.copilot.validation.admin.AdminInput;

public interface WalletAdminService {
    WalletResponse adjust(long actor, long userId, WalletAdjustmentRequest input);

    Page<WalletTransactionResponse> transactions(long userId, AdminInput.Paging paging);

    void endCurrent(long userId);
}
