package com.interview.copilot.controller.audit;

import com.interview.copilot.common.Page;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.validation.admin.AdminInput;
import com.interview.copilot.vo.audit.AuditVO;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/audit")
public class AuditController {
    private final AuditService audit;

    public AuditController(AuditService audit) {
        this.audit = audit;
    }

    @GetMapping
    public Page<AuditVO> list(
            @RequestParam(defaultValue = "1") String page,
            @RequestParam(defaultValue = "20") String size) {
        return audit.list(AdminInput.paging(page, size));
    }
}
