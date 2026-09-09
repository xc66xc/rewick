package com.interview.copilot.admin.usage;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/usage")
public class AdminUsageController {
    private final AdminUsageService usage;

    public AdminUsageController(AdminUsageService usage) { this.usage = usage; }

    @GetMapping
    public Page<UsageView> list(@RequestParam(defaultValue = "") String userId, @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "") String capability, @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "") String model, @RequestParam(defaultValue = "1") String page,
            @RequestParam(defaultValue = "20") String size) {
        return usage.list(userId, query, capability, status, model, AdminInput.paging(page, size));
    }
}
