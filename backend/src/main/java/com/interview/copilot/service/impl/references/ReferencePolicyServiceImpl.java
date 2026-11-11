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
        var updated = com.interview.copilot.converter.references.ReferencePolicyConverter.fromRequest(policy, mapper.policy());
        if (!com.interview.copilot.model.references.ReferenceRecallLimits.isValid(updated)) {
            throw new com.interview.copilot.exception.ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "reference_policy_invalid", "召回数量必须满足 rerank≤RRF≤BM25+向量，且在允许范围内。");
        }
        if (mapper.updatePolicy(updated) != 1) {
            throw new com.interview.copilot.exception.ApiException(org.springframework.http.HttpStatus.CONFLICT, "reference_policy_conflict", "资料策略已被修改，请刷新后重试。");
        }
        audit.record(actor, "reference.policy.update", "version:" + (policy.version() + 1));
    }
}
