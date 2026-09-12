package com.interview.copilot.service.impl.audit;

import com.interview.copilot.common.Page;
import com.interview.copilot.mapper.audit.AuditMapper;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.validation.admin.AdminInput;
import com.interview.copilot.vo.audit.AuditVO;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditServiceImpl implements AuditService {
    private final AuditMapper mapper;

    public AuditServiceImpl(AuditMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public void record(long actorId, String action, String target) {
        if (actorId < 1 || action == null || !action.matches("[A-Za-z0-9_.:-]{1,64}"))
            throw AdminInput.invalid();
        mapper.record(actorId, action, AdminInput.bounded(target, 160));
    }

    public Page<AuditVO> list(AdminInput.Paging paging) {
        return new Page<>(
                mapper.page(paging.size(), paging.offset()),
                mapper.count(),
                paging.page(),
                paging.size());
    }
}
