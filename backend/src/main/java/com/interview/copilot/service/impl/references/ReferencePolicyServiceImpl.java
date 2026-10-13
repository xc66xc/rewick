package com.interview.copilot.service.impl.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.request.references.ReferencePolicyRequest;
import com.interview.copilot.response.references.ReferencePolicyResponse;
import com.interview.copilot.service.references.ReferencePolicyService;

import org.springframework.stereotype.Service;

@Service
public class ReferencePolicyServiceImpl implements ReferencePolicyService {
    private final ReferenceMapper mapper;
    private final com.interview.copilot.service.audit.AuditService audit;

    public ReferencePolicyServiceImpl(ReferenceMapper mapper, com.interview.copilot.service.audit.AuditService audit) {
        this.mapper = mapper;
        this.audit = audit;
    }

    public ReferencePolicyResponse get() {
        return com.interview.copilot.converter.references.ReferencePolicyConverter.toResponse(mapper.policy());
    }

    @org.springframework.transaction.annotation.Transactional
    public void update(long actor, ReferencePolicyRequest policy) {
        if (mapper.updatePolicy(com.interview.copilot.converter.references.ReferencePolicyConverter.fromRequest(policy)) != 1) {
            throw new com.interview.copilot.exception.ApiException(org.springframework.http.HttpStatus.CONFLICT, "reference_policy_conflict", "资料策略已被修改，请刷新后重试。");
        }
        audit.record(actor, "reference.policy.update", "version:" + (policy.version() + 1));
    }
}
