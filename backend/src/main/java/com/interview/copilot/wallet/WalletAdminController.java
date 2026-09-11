package com.interview.copilot.wallet;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import com.interview.copilot.auth.UserPrincipal;
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
    public WalletAdminController(WalletService wallets,WalletAdminService admin) { this.wallets=wallets; this.admin=admin; }
    @GetMapping
    public WalletState state(@PathVariable String id) { return wallets.state(AdminInput.id(id)); }
    @PostMapping("/adjust")
    public WalletState adjust(@AuthenticationPrincipal UserPrincipal actor,@PathVariable String id,
            @RequestBody WalletAdminService.Adjustment input) { return admin.adjust(actor.id(),AdminInput.id(id),input); }
    @GetMapping("/transactions")
    public Page<WalletAdminService.Transaction> transactions(@PathVariable String id,
            @RequestParam(defaultValue="1") String page,@RequestParam(defaultValue="20") String size) {
        return admin.transactions(AdminInput.id(id),AdminInput.paging(page,size));
    }
}
