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

    public ReferencePolicyServiceImpl(ReferenceMapper mapper) {
        this.mapper = mapper;
    }

    public ReferencePolicyResponse get() {
        var policy = mapper.policy();
        return new ReferencePolicyResponse(
                policy.maxFiles(), policy.maxTotalBytes(), policy.maxChunks());
    }

    public void update(ReferencePolicyRequest policy) {
        mapper.updatePolicy(
                new ReferencePolicy(policy.maxFiles(), policy.maxTotalBytes(), policy.maxChunks()));
    }
}
