package com.interview.copilot.service.wallet;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.wallet.WalletAdjustment;
import com.interview.copilot.response.wallet.WalletResponse;
import com.interview.copilot.response.wallet.WalletTransactionResponse;
import com.interview.copilot.validation.admin.AdminInput;

public interface WalletAdminService {
    WalletResponse adjust(long actor, long userId, WalletAdjustment input);

    Page<WalletTransactionResponse> transactions(long userId, AdminInput.Paging paging);

    void endCurrent(long userId);
}
