package com.interview.copilot.controller.wallet;

import com.interview.copilot.common.Page;
import com.interview.copilot.request.wallet.WalletAdjustmentRequest;
import com.interview.copilot.response.wallet.WalletResponse;
import com.interview.copilot.response.wallet.WalletTransactionResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.wallet.WalletAdminService;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.validation.admin.AdminInput;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/users/{id}/wallet")
public class WalletAdminController {
    private final WalletService wallets;
    private final WalletAdminService admin;

    public WalletAdminController(WalletService wallets, WalletAdminService admin) {
        this.wallets = wallets;
        this.admin = admin;
    }

    @GetMapping
    public WalletResponse state(@PathVariable String id) {
        return wallets.state(AdminInput.id(id));
    }

    @PostMapping("/adjust")
    public WalletResponse adjust(
            @AuthenticationPrincipal UserPrincipal actor,
            @PathVariable String id,
            @RequestBody WalletAdjustmentRequest input) {
        return admin.adjust(actor.id(), AdminInput.id(id), input);
    }

    @GetMapping("/transactions")
    public Page<WalletTransactionResponse> transactions(
            @PathVariable String id,
            @RequestParam(defaultValue = "1") String page,
            @RequestParam(defaultValue = "20") String size) {
        return admin.transactions(AdminInput.id(id), AdminInput.paging(page, size));
    }
}
