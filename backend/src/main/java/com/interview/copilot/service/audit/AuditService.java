package com.interview.copilot.service.audit;

import com.interview.copilot.common.Page;
import com.interview.copilot.validation.admin.AdminInput;
import com.interview.copilot.vo.audit.AuditVO;

public interface AuditService {
    void record(long actorId, String action, String target);

    Page<AuditVO> list(AdminInput.Paging paging);
}
