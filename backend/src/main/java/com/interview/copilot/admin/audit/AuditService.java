package com.interview.copilot.admin.audit;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {
    private final AuditMapper mapper;

    public AuditService(AuditMapper mapper) { this.mapper = mapper; }

    @Transactional
    public void record(long actorId, String action, String target) {
        if (actorId < 1 || action == null || !action.matches("[A-Za-z0-9_.:-]{1,64}")) throw AdminInput.invalid();
        mapper.record(actorId, action, AdminInput.bounded(target, 160));
    }

    public Page<AuditView> list(AdminInput.Paging paging) {
        return new Page<>(mapper.page(paging.size(), paging.offset()), mapper.count(), paging.page(), paging.size());
    }
}
