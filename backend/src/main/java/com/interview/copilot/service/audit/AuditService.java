package com.interview.copilot.service.audit;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.audit.AuditDTO;
import com.interview.copilot.validation.admin.AdminInput;

public interface AuditService {
    void record(long actorId, String action, String target);

    Page<AuditDTO> list(AdminInput.Paging paging);
}
