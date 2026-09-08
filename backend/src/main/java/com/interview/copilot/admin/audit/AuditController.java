package com.interview.copilot.admin.audit;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/audit")
public class AuditController {
    private final AuditService audit;

    public AuditController(AuditService audit) { this.audit = audit; }

    @GetMapping
    public Page<AuditView> list(@RequestParam(defaultValue = "1") String page,
            @RequestParam(defaultValue = "20") String size) {
        return audit.list(AdminInput.paging(page, size));
    }
}
